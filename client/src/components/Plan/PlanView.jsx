import React, { useState } from "react";
import { useApp } from "../../context/AppContext.jsx";
import { PlanBlockRow } from "./PlanBlockRow.jsx";
import { formatDate, localDateKey } from "../../utils/dateUtils.js";

export const PlanView = () => {
  const {
    checkIn,
    setCheckIn,
    dailyPlan,
    setDailyPlan,
    recoverySuggested,
    setRecoverySuggested,
    planDraft,
    setPlanDraft,
    planDirty,
    setPlanDirty,
    resetPlanDraft,
    showToast,
    api,
  } = useApp();

  const [loading, setLoading] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDuration, setManualDuration] = useState(dailyPlan?.mode === "recovery" ? 10 : 25);
  const [manualKind, setManualKind] = useState("focus");

  const budget = Number(checkIn?.availableMinutes || dailyPlan?.availableMinutes || 0);
  const used = planDraft.reduce((total, block) => total + (Number(block.durationMinutes) || 0), 0);
  const overBudget = used > budget;
  const recoveryFocusCount = planDraft.filter((b) => b.kind !== "break").length;

  const createDraftId = () => globalThis.crypto?.randomUUID?.()
    || `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const handleCheckinSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const values = Object.fromEntries(formData);
    const todayKey = localDateKey();

    const payload = {
      date: todayKey,
      mood: values.mood,
      energyLevel: Number(values.energyLevel),
      availableMinutes: Number(values.availableMinutes),
      note: values.note || "",
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    };

    setLoading(true);
    try {
      const data = await api("/check-ins", { method: "POST", body: JSON.stringify(payload) });
      const planData = await api(`/plans/daily?date=${encodeURIComponent(todayKey)}`);
      const newCheckIn = data.checkIn || planData.checkIn;
      const newPlan = planData.plan || dailyPlan;

      setCheckIn(newCheckIn);
      setDailyPlan(newPlan);
      setRecoverySuggested(Boolean(planData.recoverySuggested));
      resetPlanDraft(newPlan);
      showToast("Today’s check-in is saved.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlan = async (recoveryMode) => {
    if (!checkIn) {
      showToast("Save today’s check-in before generating a plan.", "error");
      return;
    }
    if (
      dailyPlan &&
      !window.confirm(
        `Regenerate today’s plan in ${recoveryMode ? "Recovery" : "Normal"} Mode? Unsaved adjustments will be replaced.`
      )
    )
      return;

    setLoading(true);
    try {
      const data = await api("/plans/daily/generate", {
        method: "POST",
        body: JSON.stringify({ date: localDateKey(), recoveryMode }),
      });
      setDailyPlan(data.plan);
      setRecoverySuggested(Boolean(data.plan?.recoverySuggested ?? recoverySuggested));
      resetPlanDraft(data.plan);
      showToast(recoveryMode ? "Recovery Mode plan ready." : "Normal plan ready.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddManualBlock = (e) => {
    e.preventDefault();
    const durationMinutes = Number(manualDuration);
    const kind = manualKind === "break" ? "break" : "focus";

    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 120) {
      showToast("Block length must be between 1 and 120 minutes.", "error");
      return;
    }
    if (dailyPlan?.mode === "recovery" && kind === "focus" && (durationMinutes > 15 || recoveryFocusCount >= 2)) {
      showToast("Recovery Mode allows at most two focus blocks of up to 15 minutes each.", "error");
      return;
    }
    if (used + durationMinutes > budget) {
      showToast("That block would exceed today’s available-minute budget.", "error");
      return;
    }

    const newBlock = {
      _id: "",
      clientId: createDraftId(),
      title: manualTitle.trim(),
      durationMinutes,
      status: "planned",
      kind,
      reason: "Added manually",
      sourceType: "manual",
      clientOnly: true,
    };

    setPlanDraft((prev) => [...prev, newBlock]);
    setPlanDirty(true);
    setManualTitle("");
    showToast("Block added. Save adjustments when you’re ready.");
  };

  const handleSavePlan = async () => {
    if (!dailyPlan || !planDirty) return;
    if (used > budget) {
      showToast("Reduce the plan to today’s available-minute budget before saving.", "error");
      return;
    }

    setLoading(true);
    const blocks = planDraft.map((block) => ({
      ...(block._id ? { id: block._id } : { kind: block.kind }),
      title: block.title,
      durationMinutes: Number(block.durationMinutes),
      status: block.status,
    }));

    try {
      const data = await api(`/plans/daily/${dailyPlan._id}`, {
        method: "PATCH",
        body: JSON.stringify({ blocks }),
      });
      setDailyPlan(data.plan);
      resetPlanDraft(data.plan);
      showToast("Plan adjustments saved.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Plan for the day you have</p>
          <h1>Daily reset</h1>
          <p>Check in once, then shape a plan that fits your real time and energy.</p>
        </div>
      </div>

      <div className="plan-layout">
        <aside className="plan-sidebar">
          <section className="card checkin-card">
            <div className="card-header">
              <div>
                <h2>Today’s check-in</h2>
                <p>{checkIn ? "Update it if your day has changed." : "A calm minute before you plan."}</p>
              </div>
              <span className="checkin-date">{formatDate(localDateKey())}</span>
            </div>
            <form id="checkin-form" className="form-stack" onSubmit={handleCheckinSubmit}>
              <div className="field">
                <label htmlFor="checkin-mood">How are you feeling?</label>
                <select id="checkin-mood" name="mood" required defaultValue={checkIn?.mood || "neutral"}>
                  <option value="very-low">Very low</option>
                  <option value="low">Low</option>
                  <option value="neutral">Neutral</option>
                  <option value="good">Good</option>
                  <option value="great">Great</option>
                </select>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="checkin-energy">Energy (1–5)</label>
                  <select id="checkin-energy" name="energyLevel" required defaultValue={checkIn?.energyLevel || 3}>
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="checkin-minutes">Available minutes</label>
                  <input
                    id="checkin-minutes"
                    name="availableMinutes"
                    type="number"
                    min="10"
                    max="720"
                    step="5"
                    required
                    defaultValue={checkIn?.availableMinutes || 60}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="checkin-note">
                  Anything to account for? <span className="optional">(optional)</span>
                </label>
                <textarea
                  id="checkin-note"
                  name="note"
                  maxLength={500}
                  placeholder="A late class, low sleep, or something you want to protect…"
                  defaultValue={checkIn?.note || ""}
                ></textarea>
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {checkIn ? "Update check-in" : "Save check-in"}
              </button>
            </form>
          </section>

          <section className={`card recovery-card ${recoverySuggested ? "suggested" : ""}`}>
            <span className="recovery-icon">☁</span>
            <div>
              <h3>{recoverySuggested ? "Recovery Mode is available" : "Need a gentler plan?"}</h3>
              <p>
                {recoverySuggested
                  ? "Your check-in suggests lowering today’s load. You stay in control of the choice."
                  : "Recovery Mode uses at most two short focus blocks, with room to breathe."}
              </p>
            </div>
          </section>
        </aside>

        <section className="card plan-card">
          <div className="plan-card-header">
            <div>
              <p className="eyebrow">{dailyPlan ? `${dailyPlan.mode || "normal"} mode` : "Build today’s plan"}</p>
              <h2>{dailyPlan ? "Today’s study blocks" : "Turn your check-in into a clear next step"}</h2>
              <p>
                {dailyPlan?.explanation
                  ? dailyPlan.explanation
                  : "Choose a normal plan or deliberately lower the load with Recovery Mode."}
              </p>
            </div>
            {dailyPlan && (
              <span className={`mode-badge mode-${dailyPlan.mode || "normal"}`}>
                {dailyPlan.mode === "recovery" ? "Recovery" : "Normal"}
              </span>
            )}
          </div>

          {!checkIn ? (
            <div className="plan-gate">
              <span>☷</span>
              <h3>Check in before generating a plan</h3>
              <p>Your available minutes are the budget, so the plan never quietly promises more time than you have.</p>
            </div>
          ) : (
            <>
              <div className="generate-actions" aria-label="Plan generation choices">
                <button
                  className="btn btn-outline"
                  data-action="generate-plan"
                  data-recovery="false"
                  disabled={loading}
                  onClick={() => handleGeneratePlan(false)}
                >
                  {dailyPlan ? "Regenerate normal plan" : "Generate normal plan"}
                </button>
                <button
                  className="btn btn-deep"
                  data-action="generate-plan"
                  data-recovery="true"
                  disabled={loading}
                  onClick={() => handleGeneratePlan(true)}
                >
                  {dailyPlan ? "Regenerate in Recovery Mode" : "Generate Recovery Mode"}
                </button>
              </div>
              <p className="recovery-exit-note">
                Recovery Mode is never permanent. Choose <strong>Regenerate normal plan</strong> whenever you want to exit it.
              </p>

              {dailyPlan && (
                <>
                  <div className={`plan-budget ${overBudget ? "over" : ""}`} role="status">
                    <div>
                      <strong>
                        {used} of {budget} minutes planned
                      </strong>
                      <span>
                        {overBudget
                          ? `${used - budget} minutes over today’s budget`
                          : `${budget - used} minutes still available`}
                      </span>
                    </div>
                    <div className="budget-track">
                      <span
                        style={{
                          width: `${budget ? Math.min(100, Math.round((used / budget) * 100)) : 0}%`,
                        }}
                      ></span>
                    </div>
                  </div>

                  <div className="plan-blocks">
                    {planDraft.length ? (
                      planDraft.map((block, index) => (
                        <PlanBlockRow key={block.clientId} block={block} index={index} totalBlocks={planDraft.length} />
                      ))
                    ) : (
                      <div className="plan-blocks-empty">No blocks yet. Add one below.</div>
                    )}
                  </div>

                  <form id="manual-block-form" className="manual-block-form" onSubmit={handleAddManualBlock}>
                    <div className="field">
                      <label htmlFor="manual-title">Add a block</label>
                      <input
                        id="manual-title"
                        name="title"
                        maxLength={120}
                        required
                        placeholder="Review lecture notes"
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="manual-duration">Minutes</label>
                      <input
                        id="manual-duration"
                        name="durationMinutes"
                        type="number"
                        min="1"
                        max={dailyPlan.mode === "recovery" ? 15 : 120}
                        required
                        value={manualDuration}
                        onChange={(e) => setManualDuration(Number(e.target.value))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="manual-kind">Kind</label>
                      <select
                        id="manual-kind"
                        name="kind"
                        data-action="manual-kind"
                        value={manualKind}
                        onChange={(e) => {
                          setManualKind(e.target.value);
                          if (dailyPlan.mode === "recovery" && e.target.value === "focus") {
                            setManualDuration((prev) => Math.min(prev, 15));
                          }
                        }}
                      >
                        <option value="focus">Focus</option>
                        <option value="break">Break</option>
                      </select>
                    </div>
                    <button
                      className="btn btn-outline btn-small"
                      type="submit"
                      title={
                        dailyPlan.mode === "recovery" && recoveryFocusCount >= 2
                          ? "Recovery Mode allows at most two focus blocks"
                          : undefined
                      }
                    >
                      + Add block
                    </button>
                  </form>

                  <div className="plan-save-row">
                    <span>
                      {planDirty
                        ? "Unsaved adjustments"
                        : dailyPlan.manuallyAdjusted
                        ? "Adjusted plan saved"
                        : "Generated plan"}
                    </span>
                    <button
                      className="btn btn-primary"
                      data-action="save-plan"
                      disabled={!planDirty || overBudget || loading}
                      onClick={handleSavePlan}
                    >
                      Save adjustments
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
};

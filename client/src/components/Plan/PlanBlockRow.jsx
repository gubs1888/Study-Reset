import React from "react";
import { useApp } from "../../context/AppContext.jsx";

export const PlanBlockRow = ({ block, index, totalBlocks }) => {
  const { dailyPlan, planDraft, setPlanDraft, setPlanDirty, showToast } = useApp();

  const recoveryFocus = dailyPlan?.mode === "recovery" && block.kind !== "break";

  const handleMove = (direction) => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= planDraft.length) return;
    const nextDraft = [...planDraft];
    [nextDraft[index], nextDraft[nextIndex]] = [nextDraft[nextIndex], nextDraft[index]];
    setPlanDraft(nextDraft);
    setPlanDirty(true);
  };

  const handleRemove = () => {
    setPlanDraft((prev) => prev.filter((b) => b.clientId !== block.clientId));
    setPlanDirty(true);
  };

  const handleDurationChange = (e) => {
    const minutes = Number(e.target.value);
    const max = recoveryFocus ? 15 : 120;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > max) {
      showToast(`Block length must be between 1 and ${max} minutes.`, "error");
      return;
    }
    setPlanDraft((prev) =>
      prev.map((b) => (b.clientId === block.clientId ? { ...b, durationMinutes: minutes } : b))
    );
    setPlanDirty(true);
  };

  const handleStatusChange = (e) => {
    const val = e.target.value;
    if (!["planned", "completed", "skipped"].includes(val)) return;
    setPlanDraft((prev) =>
      prev.map((b) => (b.clientId === block.clientId ? { ...b, status: val } : b))
    );
    setPlanDirty(true);
  };

  return (
    <article
      className={`plan-block ${block.kind === "break" ? "break-block" : "focus-block"}`}
      data-block-id={block.clientId}
    >
      <div className="plan-block-order">
        <button
          data-action="move-plan-block"
          data-direction="up"
          data-id={block.clientId}
          aria-label={`Move ${block.title} up`}
          disabled={index === 0}
          onClick={() => handleMove("up")}
        >
          ↑
        </button>
        <button
          data-action="move-plan-block"
          data-direction="down"
          data-id={block.clientId}
          aria-label={`Move ${block.title} down`}
          disabled={index === totalBlocks - 1}
          onClick={() => handleMove("down")}
        >
          ↓
        </button>
      </div>

      <div className="plan-block-copy">
        <span>{block.kind === "break" ? "Break" : (block.sourceType || "focus").replace("manual", "Focus")}</span>
        <strong>{block.title}</strong>
        {block.reason ? <p>{block.reason}</p> : null}
      </div>

      <label className="plan-duration">
        <span className="sr-only">Minutes for {block.title}</span>
        <input
          type="number"
          min="1"
          max={recoveryFocus ? 15 : 120}
          value={block.durationMinutes}
          data-action="plan-duration"
          data-id={block.clientId}
          onChange={handleDurationChange}
        />
        <small>min</small>
      </label>

      <label className="plan-status-field">
        <span className="sr-only">Status for {block.title}</span>
        <select
          className="plan-status"
          data-action="plan-status"
          data-id={block.clientId}
          value={block.status}
          onChange={handleStatusChange}
        >
          <option value="planned">Planned</option>
          <option value="completed">Completed</option>
          <option value="skipped">Skipped</option>
        </select>
      </label>

      <button
        className="task-action plan-remove"
        data-action="remove-plan-block"
        data-id={block.clientId}
        aria-label={`Remove ${block.title}`}
        onClick={handleRemove}
      >
        ×
      </button>
    </article>
  );
};

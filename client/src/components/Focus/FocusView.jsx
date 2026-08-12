import React, { useEffect, useState, useCallback, useRef } from "react";
import { useApp } from "../../context/AppContext.jsx";
import { FocusHistory } from "./FocusHistory.jsx";
import {
  formatMinutes,
  formatTimerClock,
  isToday,
} from "../../utils/dateUtils.js";

export const FocusView = () => {
  const {
    tasks,
    subjects,
    focusSessions,
    timer,
    setTimer,
    effectiveFocusedSeconds,
    remainingFocusSeconds,
    persistFocusTimer,
    clearPersistedFocusTimer,
    upsertFocusSession,
    replaceTaskFromResponse,
    showToast,
    api,
    currentUserId,
  } = useApp();

  const [tick, setTick] = useState(0);
  const completingRef = useRef(false);
  const selectRef = useRef(null);

  const controlsLocked = Boolean(timer.clientSessionId);
  const busy = timer.starting || timer.completing || timer.cancelling;

  const subjectIdForTask = (task) => {
    if (!task) return "";
    if (typeof task.subject === "object" && task.subject !== null) {
      return String(task.subject._id || task.subject.id || "");
    }
    return String(task.subject || "");
  };

  const subjectForTask = (task) => {
    if (!task) return { _id: "", name: "Study", color: "#062f72" };
    const sId = subjectIdForTask(task);
    return (
      subjects.find((s) => String(s._id || s.id) === sId) ||
      (task.subject && typeof task.subject === "object" ? task.subject : null) ||
      { _id: sId, name: "Study", color: "#062f72" }
    );
  };

  const handleTaskSelect = useCallback((e) => {
    if (controlsLocked) return;
    const val = typeof e === "string" ? e : e?.target?.value || "";
    if (!val) {
      setTimer((prev) => ({
        ...prev,
        selectedTaskId: "",
        selectedSubjectId: "",
        markTaskCompleted: false,
      }));
      return;
    }
    const task = tasks.find((t) => String(t._id || t.id) === val);
    const subId = task ? subjectIdForTask(task) : "";
    setTimer((prev) => ({
      ...prev,
      selectedTaskId: val,
      selectedSubjectId: subId,
      markTaskCompleted: task ? prev.markTaskCompleted : false,
    }));
  }, [controlsLocked, tasks, setTimer]);

  useEffect(() => {
    const handleEvent = () => {
      const selectEl = document.getElementById("focus-task");
      if (selectEl && selectEl.value) {
        handleTaskSelect(selectEl.value);
      }
    };
    document.addEventListener("change", handleEvent, true);
    document.addEventListener("input", handleEvent, true);
    return () => {
      document.removeEventListener("change", handleEvent, true);
      document.removeEventListener("input", handleEvent, true);
    };
  }, [handleTaskSelect]);

  // Active interval loop
  useEffect(() => {
    let interval = null;
    if (timer.running) {
      interval = setInterval(() => {
        setTick((t) => t + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer.running]);

  const domTaskId = timer.selectedTaskId || (typeof document !== "undefined" ? document.getElementById("focus-task")?.value || "" : "");
  const selectedTask = tasks.find((t) => String(t._id || t.id) === String(domTaskId));
  const effectiveSubjectId = timer.selectedSubjectId || (selectedTask ? subjectIdForTask(selectedTask) : "") || subjects[0]?._id || subjects[0]?.id || "";

  const selectedSubject =
    subjects.find((s) => String(s._id || s.id) === effectiveSubjectId) ||
    (selectedTask ? subjectForTask(selectedTask) : null);

  const eligibleTasks = tasks.filter((task) => {
    const sub = subjectForTask(task);
    return task.status !== "completed" && (!sub || !sub.isArchived);
  });

  if (selectedTask && !eligibleTasks.some((t) => String(t._id || t.id) === String(selectedTask._id || selectedTask.id))) {
    eligibleTasks.unshift(selectedTask);
  }

  useEffect(() => {
    if (!timer.selectedTaskId && eligibleTasks.length > 0 && !timer.clientSessionId) {
      const firstTask = eligibleTasks[0];
      const taskId = String(firstTask._id || firstTask.id);
      const subId = subjectIdForTask(firstTask);
      setTimer((prev) => ({
        ...prev,
        selectedTaskId: taskId,
        selectedSubjectId: subId,
      }));
    }
  }, [timer.selectedTaskId, timer.clientSessionId, setTimer, tasks, subjects]);

  const remaining = remainingFocusSeconds(timer);
  const effectiveSec = effectiveFocusedSeconds(timer);
  const progress = timer.totalSeconds ? Math.min(1, effectiveSec / timer.totalSeconds) : 0;

  const canStart = Boolean(domTaskId) && !busy;


  const presets = [10, 25, 45, 60];

  const createClientSessionId = () => {
    const randomPart =
      globalThis.crypto?.randomUUID?.() ||
      `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    return `focus-${Date.now()}-${randomPart}`.slice(0, 128);
  };

  const focusTimerStatus = () => {
    if (timer.starting) return "Creating your focus session…";
    if (timer.completing) return "Saving your completed focus session…";
    if (timer.cancelling) return "Cancelling this focus session…";
    if (timer.completionPending) return "Time is up. Your completed session is ready to save.";
    if (timer.serverSessionId && timer.running) {
      return `Timer running${selectedTask ? ` for ${selectedTask.title}` : ""}.`;
    }
    if (timer.serverSessionId) return "Timer paused. Resume when you are ready.";
    if (timer.clientSessionId) return "The start request was interrupted. Retry to safely continue the same session.";
    if (selectedTask) return `Ready to focus on ${selectedTask.title}.`;
    return "Choose a task and session length to begin.";
  };

  const completeFocusSession = useCallback(
    async ({ automatic = false } = {}) => {
      if (!timer.serverSessionId || timer.completing || timer.cancelling || completingRef.current) return;

      completingRef.current = true;
      const sessionUserId = currentUserId();
      const serverSessionId = timer.serverSessionId;

      const finalFocusedSec = effectiveFocusedSeconds(timer);
      const newState = {
        ...timer,
        focusedSeconds: finalFocusedSec,
        running: false,
        runningSince: null,
        completionPending: true,
        completing: true,
      };
      setTimer(newState);
      persistFocusTimer(newState);

      const actualFocusedMinutes = Math.min(
        timer.plannedMinutes,
        Math.max(0, Math.round(finalFocusedSec / 60))
      );
      const markTaskCompleted = Boolean(timer.markTaskCompleted);

      try {
        const data = await api(`/focus-sessions/${serverSessionId}/complete`, {
          method: "PATCH",
          body: JSON.stringify({ actualFocusedMinutes, markTaskCompleted }),
        });
        if (currentUserId() !== sessionUserId) return;

        upsertFocusSession(data.session);
        replaceTaskFromResponse(
          data.task || (data.session?.task && typeof data.session.task === "object" ? data.session.task : null)
        );
        clearPersistedFocusTimer();
        setTimer({
          plannedMinutes: 25,
          totalSeconds: 25 * 60,
          focusedSeconds: 0,
          running: false,
          runningSince: null,
          selectedTaskId: "",
          selectedSubjectId: "",
          markTaskCompleted: false,
          serverSessionId: null,
          clientSessionId: null,
          completionPending: false,
          starting: false,
          completing: false,
          cancelling: false,
        });

        const completionMessage = data.taskMarkedCompleted
          ? "Focus session saved and task completed."
          : automatic
          ? "Focus session complete. Take a proper break."
          : "Focus session saved.";
        showToast(completionMessage);
      } catch (error) {
        if (currentUserId() === sessionUserId) {
          setTimer((prev) => ({
            ...prev,
            completing: false,
            completionPending: true,
          }));
        }
        showToast(error.message, "error");
      } finally {
        completingRef.current = false;
      }
    },
    [
      api,
      clearPersistedFocusTimer,
      currentUserId,
      effectiveFocusedSeconds,
      persistFocusTimer,
      replaceTaskFromResponse,
      setTimer,
      showToast,
      timer,
      upsertFocusSession,
    ]
  );

  // Check if timer finished automatically
  useEffect(() => {
    if (
      remaining <= 0 &&
      timer.serverSessionId &&
      !timer.completionPending &&
      !timer.completing &&
      !completingRef.current
    ) {
      completeFocusSession({ automatic: true });
    }
  }, [remaining, timer.serverSessionId, timer.completionPending, timer.completing, completeFocusSession]);

  const startFocusSession = async () => {
    if (timer.serverSessionId || timer.starting || timer.completing || timer.cancelling) return;

    const taskId = timer.selectedTaskId || (typeof document !== "undefined" ? document.getElementById("focus-task")?.value || "" : "");
    const task = tasks.find((item) => String(item._id || item.id) === String(taskId));
    const subjectId = timer.selectedSubjectId || (task ? subjectIdForTask(task) : "") || (subjects[0]?._id || subjects[0]?.id || "");
    const plannedMinutes = Number(timer.plannedMinutes);

    if (!taskId || !subjectId) {
      showToast("Choose a study task before starting.", "error");
      return;
    }
    if (!Number.isInteger(plannedMinutes) || plannedMinutes < 10 || plannedMinutes > 600) {
      showToast("Session length must be between 10 and 600 minutes.", "error");
      return;
    }

    const sessionUserId = currentUserId();
    const clientId = timer.clientSessionId || createClientSessionId();

    const startingState = {
      ...timer,
      selectedTaskId: taskId,
      selectedSubjectId: subjectId,
      clientSessionId: clientId,
      starting: true,
    };
    setTimer(startingState);
    persistFocusTimer(startingState);

    try {
      const data = await api("/focus-sessions", {
        method: "POST",
        body: JSON.stringify({
          subject: subjectId,
          task: taskId,
          plannedMinutes,
          clientSessionId: clientId,
        }),
      });

      if (currentUserId() !== sessionUserId) return;

      const session = data.session;
      const serverSessionId = session?._id || session?.id || "";
      if (!serverSessionId) throw new Error("The focus session could not be started.");

      upsertFocusSession(session);

      if (session.status && session.status !== "active") {
        clearPersistedFocusTimer();
        setTimer({
          plannedMinutes: 25,
          totalSeconds: 25 * 60,
          focusedSeconds: 0,
          running: false,
          runningSince: null,
          selectedTaskId: "",
          selectedSubjectId: "",
          markTaskCompleted: false,
          serverSessionId: null,
          clientSessionId: null,
          completionPending: false,
          starting: false,
          completing: false,
          cancelling: false,
        });
        showToast("This focus session was already closed.");
        return;
      }

      const runningState = {
        ...startingState,
        serverSessionId,
        starting: false,
        running: true,
        runningSince: Date.now(),
        completionPending: false,
      };
      setTimer(runningState);
      persistFocusTimer(runningState);
      showToast("Focus session started.");
    } catch (error) {
      if (currentUserId() === sessionUserId) {
        setTimer((prev) => ({
          ...prev,
          starting: false,
          clientSessionId: error.status && error.status >= 400 && error.status < 500 && error.status !== 401 ? null : prev.clientSessionId,
        }));
      }
      showToast(error.message, "error");
    }
  };

  const pauseFocusTimer = () => {
    if (!timer.serverSessionId || !timer.running || timer.completionPending) return;
    const pausedState = {
      ...timer,
      focusedSeconds: effectiveFocusedSeconds(timer),
      running: false,
      runningSince: null,
    };
    setTimer(pausedState);
    persistFocusTimer(pausedState);
  };

  const resumeFocusTimer = () => {
    if (!timer.serverSessionId || timer.running || timer.completionPending) return;
    if (effectiveFocusedSeconds(timer) >= timer.totalSeconds) {
      completeFocusSession({ automatic: true });
      return;
    }
    const resumedState = {
      ...timer,
      running: true,
      runningSince: Date.now(),
    };
    setTimer(resumedState);
    persistFocusTimer(resumedState);
  };

  const cancelFocusSession = async () => {
    if (
      !timer.serverSessionId ||
      timer.completing ||
      timer.cancelling ||
      !window.confirm("Cancel this focus session? Its elapsed time will not count toward today’s total.")
    )
      return;

    const sessionUserId = currentUserId();
    const serverSessionId = timer.serverSessionId;

    const cancellingState = {
      ...timer,
      focusedSeconds: effectiveFocusedSeconds(timer),
      running: false,
      runningSince: null,
      cancelling: true,
    };
    setTimer(cancellingState);
    persistFocusTimer(cancellingState);

    try {
      const data = await api(`/focus-sessions/${serverSessionId}/cancel`, { method: "PATCH" });
      if (currentUserId() !== sessionUserId) return;

      upsertFocusSession(data.session);
      clearPersistedFocusTimer();
      setTimer({
        plannedMinutes: 25,
        totalSeconds: 25 * 60,
        focusedSeconds: 0,
        running: false,
        runningSince: null,
        selectedTaskId: "",
        selectedSubjectId: "",
        markTaskCompleted: false,
        serverSessionId: null,
        clientSessionId: null,
        completionPending: false,
        starting: false,
        completing: false,
        cancelling: false,
      });
      showToast("Focus session cancelled.");
    } catch (error) {
      if (currentUserId() === sessionUserId) {
        setTimer((prev) => ({ ...prev, cancelling: false }));
      }
      showToast(error.message, "error");
    }
  };


  const handleDurationChange = (e) => {
    if (controlsLocked) return;
    const minutes = Number(e.target.value);
    if (!Number.isInteger(minutes) || minutes < 10 || minutes > 600) {
      showToast("Session length must be between 10 and 600 minutes.", "error");
      return;
    }
    setTimer((prev) => ({
      ...prev,
      plannedMinutes: minutes,
      totalSeconds: minutes * 60,
      focusedSeconds: 0,
    }));
  };

  const handlePresetClick = (minutes) => {
    if (controlsLocked) return;
    setTimer((prev) => ({
      ...prev,
      plannedMinutes: minutes,
      totalSeconds: minutes * 60,
      focusedSeconds: 0,
    }));
  };

  const completedMinutesToday = focusSessions
    .filter((s) => s.status === "completed" && isToday(s.endedAt || s.startedAt))
    .reduce((sum, s) => sum + (Number(s.actualFocusedMinutes) || 0), 0);

  let timerActions;
  if (!timer.serverSessionId) {
    timerActions = (
      <button
        className="btn btn-accent"
        data-action="focus-start"
        disabled={!canStart}
        onClick={startFocusSession}
      >
        {timer.starting ? "Starting…" : timer.clientSessionId ? "Retry start" : "Start focus"}
      </button>
    );
  } else if (timer.completionPending) {
    timerActions = (
      <button
        className="btn btn-accent"
        data-action="focus-finish"
        disabled={busy}
        onClick={() => completeFocusSession()}
      >
        {timer.completing ? "Saving…" : "Finish & save"}
      </button>
    );
  } else {
    timerActions = (
      <>
        <button
          className="btn btn-accent"
          data-action={timer.running ? "focus-pause" : "focus-resume"}
          disabled={busy}
          onClick={timer.running ? pauseFocusTimer : resumeFocusTimer}
        >
          {timer.running ? "Pause" : "Resume"}
        </button>
        <button
          className="btn btn-outline"
          data-action="focus-finish"
          disabled={busy}
          onClick={() => completeFocusSession()}
        >
          Finish now
        </button>
        <button
          className="btn btn-ghost focus-cancel-button"
          data-action="focus-cancel"
          disabled={busy}
          onClick={cancelFocusSession}
        >
          Cancel
        </button>
      </>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Protect your attention</p>
          <h1>Focus room</h1>
          <p>One task. One timer. Your active session safely survives a refresh.</p>
        </div>
      </div>

      <div className="focus-page">
        <section className="card timer-card">
          <div className="timer-content">
            <div className="timer-mode">
              {timer.serverSessionId
                ? timer.running
                  ? "Focus in progress"
                  : "Focus paused"
                : "Focus session"}
            </div>
            <div
              className="timer-ring"
              id="timer-ring"
              style={{ "--timer-progress": `${Math.round(progress * 360)}deg` }}
              aria-label={`${formatTimerClock(remaining)} remaining`}
            >
              <div>
                <div className="timer-time" id="timer-time">
                  {formatTimerClock(remaining)}
                </div>
                <div className="timer-caption">time remaining</div>
              </div>
            </div>
            <strong className="timer-task-name">
              {selectedTask?.title || "Choose your next task"}
            </strong>
            <p
              className="timer-status"
              id="timer-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {focusTimerStatus()}
            </p>
          </div>
        </section>

        <aside className="focus-controls">
          <section className="card focus-setup">
            <div className="focus-setup-heading">
              <div>
                <h2>Plan this session</h2>
                <p>{formatMinutes(completedMinutesToday)} focused today</p>
              </div>
              <span>◷</span>
            </div>

            <div className="field">
              <label htmlFor="focus-task">Study task</label>
              <select
                id="focus-task"
                data-action="focus-task"
                disabled={controlsLocked}
                value={String(timer.selectedTaskId || "")}
                onChange={handleTaskSelect}
              >
                <option value="">Choose a task</option>
                {eligibleTasks.map((task) => {
                  const sub = subjectForTask(task);
                  const taskIdStr = String(task._id || task.id);
                  return (
                    <option key={taskIdStr} value={taskIdStr}>
                      {task.title} · {sub.name}
                    </option>
                  );
                })}
              </select>
              {!eligibleTasks.length && (
                <p className="field-note">Add an active task before starting a focus session.</p>
              )}
            </div>

            <div className="field">
              <label htmlFor="focus-duration">Session length</label>
              <div className="duration-input">
                <input
                  id="focus-duration"
                  data-action="focus-duration"
                  type="number"
                  min="10"
                  max="600"
                  step="1"
                  disabled={controlsLocked}
                  value={timer.plannedMinutes}
                  onChange={handleDurationChange}
                />
                <span>minutes</span>
              </div>
              <div className="duration-presets" aria-label="Session length presets">
                {presets.map((mins) => (
                  <button
                    key={mins}
                    className={`duration-preset ${timer.plannedMinutes === mins ? "active" : ""}`}
                    data-action="focus-duration-preset"
                    data-minutes={mins}
                    disabled={controlsLocked}
                    onClick={() => handlePresetClick(mins)}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            <label className={`focus-checkbox ${timer.selectedTaskId ? "" : "disabled"}`}>
              <input
                type="checkbox"
                data-action="focus-mark-complete"
                checked={timer.markTaskCompleted}
                disabled={!timer.selectedTaskId || timer.completing || timer.cancelling}
                onChange={(e) => {
                  const val = Boolean(e.target.checked && timer.selectedTaskId);
                  const newState = { ...timer, markTaskCompleted: val };
                  setTimer(newState);
                  if (timer.clientSessionId) persistFocusTimer(newState);
                }}
              />
              <span>
                <strong>Mark task complete</strong>
                <small>Update the linked task when this session finishes.</small>
              </span>
            </label>

            <div className="timer-actions">{timerActions}</div>

            {selectedSubject && (
              <p className="focus-subject-note">
                <span className="subject-dot" style={{ background: selectedSubject.color || "#062f72" }}></span>{" "}
                Session saved under {selectedSubject.name}
              </p>
            )}
          </section>

          <article className="card tip">
            <span className="tip-number">01</span>
            <h3>Protect the finish line</h3>
            <p>
              Close extra tabs and work only on the task you selected. Pause if you step away so focused time stays honest.
            </p>
          </article>
        </aside>
      </div>

      <section className="card focus-history-card">
        <div className="card-header">
          <div>
            <h2>Recent focus history</h2>
            <p>Saved sessions from the last seven days</p>
          </div>
          <strong>{formatMinutes(completedMinutesToday)} today</strong>
        </div>
        <div className="focus-history-list">
          <FocusHistory />
        </div>
      </section>
    </>
  );
};

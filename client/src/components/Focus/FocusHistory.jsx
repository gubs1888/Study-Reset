import React from "react";
import { useApp } from "../../context/AppContext.jsx";
import { formatMinutes, formatSessionDate } from "../../utils/dateUtils.js";

export const FocusHistory = () => {
  const { focusSessions, tasks, subjects } = useApp();

  const sessions = [...focusSessions]
    .sort((left, right) => new Date(right.startedAt || 0) - new Date(left.startedAt || 0))
    .slice(0, 8);

  if (!sessions.length) {
    return (
      <div className="focus-history-empty">
        <span>◷</span>
        <div>
          <strong>No saved sessions yet</strong>
          <p>Complete your first timer and it will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {sessions.map((session) => {
        const taskId = typeof session?.task === "object" ? session.task?._id : session?.task;
        const task = tasks.find((t) => t._id === taskId) || (typeof session?.task === "object" ? session.task : null);

        const subjectId = typeof session?.subject === "object" ? session.subject?._id : session?.subject;
        const subject = subjects.find((s) => s._id === subjectId) || (typeof session?.subject === "object" ? session.subject : null);

        const actualMinutes = Number(session.actualFocusedMinutes) || 0;
        const duration = session.status === "completed" ? actualMinutes : Number(session.plannedMinutes) || 0;
        const status = ["active", "completed", "cancelled"].includes(session.status) ? session.status : "active";

        return (
          <article key={session._id || session.id} className="focus-history-item">
            <div className="focus-history-mark" style={{ "--history-color": subject?.color || "#062f72" }}>
              ◷
            </div>
            <div className="focus-history-copy">
              <div>
                <strong>{task?.title || "Focus session"}</strong>
                <span className={`session-status status-${status}`}>{status}</span>
              </div>
              <p>
                {subject?.name || "Study"} · {formatSessionDate(session)}
              </p>
            </div>
            <strong className="focus-history-duration">{formatMinutes(duration)}</strong>
          </article>
        );
      })}
    </>
  );
};

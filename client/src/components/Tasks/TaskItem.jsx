import React from "react";
import { useApp } from "../../context/AppContext.jsx";
import { formatDate, formatMinutes } from "../../utils/dateUtils.js";

const taskStatuses = [
  ["pending", "To do"],
  ["in-progress", "In progress"],
  ["completed", "Completed"],
];

export const TaskItem = ({ task, showDelete = true }) => {
  const { subjects, setTasks, openTaskModal, showToast, api } = useApp();

  const subjectId = typeof task.subject === "object" ? task.subject?._id : task.subject;
  const subject = subjects.find((s) => s._id === subjectId)
    || (task.subject && typeof task.subject === "object" ? task.subject : null)
    || { name: "Study", color: "#062f72" };

  const complete = task.status === "completed";

  const handleToggle = async () => {
    try {
      const nextStatus = complete ? "pending" : "completed";
      const data = await api(`/tasks/${task._id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setTasks((prev) => prev.map((item) => (item._id === task._id ? data.task : item)));
      showToast(data.task.status === "completed" ? "Nice work — task completed." : "Task moved back to your queue.");
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const handleStatusChange = async (e) => {
    const nextStatus = e.target.value;
    if (nextStatus === task.status) return;

    try {
      const data = await api(`/tasks/${task._id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setTasks((prev) => prev.map((item) => (item._id === task._id ? data.task : item)));
      const statusLabel = taskStatuses.find(([v]) => v === data.task.status)?.[1] || "To do";
      showToast(`Task moved to ${statusLabel.toLowerCase()}.`);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    try {
      await api(`/tasks/${task._id}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((item) => item._id !== task._id));
      showToast("Task deleted.");
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  return (
    <article className={`task-item status-${task.status} ${complete ? "completed" : ""}`}>
      <button
        className="task-check"
        data-action="toggle-task"
        data-id={task._id}
        aria-label={`${complete ? "Reopen" : "Complete"} ${task.title}`}
        onClick={handleToggle}
      >
        {complete ? "✓" : ""}
      </button>
      <div>
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <span>
            <span className="subject-dot" style={{ background: subject.color }}></span> {subject.name}
          </span>
          <span>•</span>
          <span>{formatMinutes(task.estimatedMinutes)}</span>
          {task.dueDate ? <span>• Due {formatDate(task.dueDate)}</span> : null}
          <span className={`priority ${task.priority}`}>{task.priority}</span>
        </div>
      </div>
      <div className="task-actions">
        <label className="task-status-control">
          <span className="sr-only">Status for {task.title}</span>
          <select
            className={`task-status-select status-${task.status}`}
            data-action="set-task-status"
            data-id={task._id}
            aria-label={`Status for ${task.title}`}
            value={task.status}
            onChange={handleStatusChange}
          >
            {taskStatuses.map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="task-action"
          data-action="edit-task"
          data-id={task._id}
          aria-label="Edit task"
          onClick={() => openTaskModal(task)}
        >
          ✎
        </button>
        {showDelete && (
          <button
            className="task-action"
            data-action="delete-task"
            data-id={task._id}
            aria-label="Delete task"
            onClick={handleDelete}
          >
            ×
          </button>
        )}
      </div>
    </article>
  );
};

import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../../context/AppContext.jsx";
import { dateOnlyKey } from "../../utils/dateUtils.js";

const taskStatuses = [
  ["pending", "To do"],
  ["in-progress", "In progress"],
  ["completed", "Completed"],
];

export const TaskModal = () => {
  const { modalData: task, subjects, setTasks, closeModal, showToast, api } = useApp();
  const [loading, setLoading] = useState(false);
  const titleInputRef = useRef(null);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const activeSubjects = subjects.filter((s) => !s.isArchived);

  const subjectIdFor = (t) => (typeof t?.subject === "object" ? t.subject?._id : t?.subject);
  const subjectFor = (t) => {
    const sId = subjectIdFor(t);
    return subjects.find((s) => s._id === sId)
      || (t?.subject && typeof t.subject === "object" ? t.subject : null)
      || { name: "Study", color: "#062f72" };
  };

  const currentSubjectId = task ? subjectIdFor(task) : activeSubjects[0]?._id;
  const currentSubject = task ? subjectFor(task) : activeSubjects[0];
  const subjectAssociationLocked = Boolean(task) && !activeSubjects.some((s) => s._id === currentSubjectId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const values = Object.fromEntries(formData);

    values.estimatedMinutes = Number(values.estimatedMinutes);
    values.dueDate = values.dueDate || null;
    const id = task?._id;

    if (id && values.status === task?.status) {
      delete values.status;
    }

    setLoading(true);
    try {
      const data = await api(id ? `/tasks/${id}` : "/tasks", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });

      if (id) {
        setTasks((prev) => prev.map((t) => (t._id === id ? data.task : t)));
      } else {
        setTasks((prev) => [data.task, ...prev]);
      }

      closeModal();
      showToast(id ? "Task updated." : "Task added to your queue.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" data-action="modal-backdrop" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div className="modal-header">
          <div>
            <h2 id="task-modal-title">{task ? "Edit study task" : "Add a study task"}</h2>
            <p>Make the next action specific and achievable.</p>
          </div>
          <button className="btn btn-ghost icon-button" data-action="close-modal" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>

        <form id="task-form" className="form-stack" data-id={task?._id || ""} data-original-status={task?.status || ""} onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="task-title">Task title</label>
            <input
              ref={titleInputRef}
              id="task-title"
              name="title"
              required
              maxLength={120}
              placeholder="Complete chapter 3 exercises"
              defaultValue={task?.title || ""}
            />
          </div>

          <div className="field">
            <label htmlFor="task-description">
              Notes <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span>
            </label>
            <textarea
              id="task-description"
              name="description"
              maxLength={500}
              placeholder="What does done look like?"
              defaultValue={task?.description || ""}
            ></textarea>
          </div>

          {subjectAssociationLocked ? (
            <div className="field">
              <label>Subject</label>
              <div className="locked-subject">
                <span className="subject-dot" style={{ background: currentSubject.color || "#062f72" }}></span>
                <strong>{currentSubject.name || "Archived subject"}</strong>
                <span>Archived</span>
              </div>
              <p className="field-note">This task will stay linked to its archived subject.</p>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="task-subject">Subject</label>
              <select id="task-subject" name="subject" required defaultValue={currentSubjectId}>
                {activeSubjects.map((s) => (
                  <option key={String(s._id || s.id)} value={String(s._id || s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label htmlFor="task-minutes">Estimated minutes</label>
              <input id="task-minutes" name="estimatedMinutes" type="number" min="1" max="600" defaultValue={task?.estimatedMinutes || 25} required />
            </div>
            <div className="field">
              <label htmlFor="task-priority">Priority</label>
              <select id="task-priority" name="priority" defaultValue={task?.priority || "medium"}>
                {["low", "medium", "high"].map((p) => (
                  <option key={p} value={p}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={`field-row ${task ? "" : "single-field"}`}>
            <div className="field">
              <label htmlFor="task-due">
                Due date <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span>
              </label>
              <input id="task-due" name="dueDate" type="date" defaultValue={task?.dueDate ? dateOnlyKey(task.dueDate) : ""} />
            </div>
            {task && (
              <div className="field">
                <label htmlFor="task-status">Status</label>
                <select id="task-status" name="status" defaultValue={task.status}>
                  {taskStatuses.map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" data-action="close-modal" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Saving…" : task ? "Save changes" : "Add task"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

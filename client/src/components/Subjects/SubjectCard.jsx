import React, { useState } from "react";
import { useApp } from "../../context/AppContext.jsx";

export const SubjectCard = ({ subject, archived = false }) => {
  const { tasks, setSubjects, openSubjectModal, showToast, api } = useApp();
  const [loading, setLoading] = useState(false);

  const subjectTasks = tasks.filter((t) => {
    const sId = typeof t.subject === "object" ? t.subject?._id : t.subject;
    return sId === subject._id;
  });
  const done = subjectTasks.filter((t) => t.status === "completed").length;
  const percent = subjectTasks.length ? Math.round((done / subjectTasks.length) * 100) : 0;

  const handleArchive = async () => {
    if (!window.confirm(`Archive “${subject.name}”? Its existing tasks will remain.`)) return;
    setLoading(true);
    try {
      await api(`/subjects/${subject._id}`, { method: "DELETE" });
      setSubjects((prev) =>
        prev.map((item) => (item._id === subject._id ? { ...item, isArchived: true } : item))
      );
      showToast("Subject archived.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const data = await api(`/subjects/${subject._id}/restore`, { method: "POST" });
      setSubjects((prev) =>
        prev.map((item) =>
          item._id === subject._id ? { ...item, ...(data.subject || {}), isArchived: false } : item
        )
      );
      showToast("Subject restored.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <article
      className={`card subject-card ${archived ? "archived" : ""}`}
      style={{ "--subject-color": subject.color }}
    >
      <div className="subject-mark">{subject.name[0]?.toUpperCase()}</div>
      <div className="subject-card-heading">
        <h3>{subject.name}</h3>
        {archived && <span className="archived-badge">Archived</span>}
      </div>
      <p>{subject.description || "A focused space for your study tasks."}</p>
      <div className="subject-footer">
        <span>
          {subjectTasks.length} task{subjectTasks.length === 1 ? "" : "s"} · {percent}% complete
        </span>
        <div className="subject-actions">
          {archived ? (
            <button
              className="subject-action"
              data-action="restore-subject"
              data-id={subject._id}
              disabled={loading}
              onClick={handleRestore}
            >
              {loading ? "Restoring…" : "Restore"}
            </button>
          ) : (
            <>
              <button
                className="subject-action"
                data-action="edit-subject"
                data-id={subject._id}
                onClick={() => openSubjectModal(subject)}
              >
                Edit
              </button>
              <button
                className="subject-action subject-action-muted"
                data-action="archive-subject"
                data-id={subject._id}
                disabled={loading}
                onClick={handleArchive}
              >
                {loading ? "Archiving…" : "Archive"}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
};

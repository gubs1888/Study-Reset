import React, { useState } from "react";
import { useApp } from "../../context/AppContext.jsx";
import { formatDate, dateForDisplay, relativeDayLabel } from "../../utils/dateUtils.js";

export const ExamCard = ({ exam }) => {
  const { subjects, topics, setExams, openExamModal, showToast, api } = useApp();
  const [loading, setLoading] = useState(false);

  const examSubId = typeof exam?.subject === "object" ? exam.subject?._id : exam?.subject;
  const subject = subjects.find((s) => s._id === examSubId)
    || (exam?.subject && typeof exam.subject === "object" ? exam.subject : null)
    || { name: "Study", color: "#062f72" };

  const completed = Boolean(exam.isCompleted);

  const topicNames = (Array.isArray(exam.syllabusTopics) ? exam.syllabusTopics : [])
    .map((t) => (typeof t === "object" ? t.name : topics.find((item) => item._id === t)?.name))
    .filter(Boolean);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const data = await api(`/exams/${exam._id}`, {
        method: "PATCH",
        body: JSON.stringify({ isCompleted: !exam.isCompleted }),
      });
      setExams((prev) => prev.map((item) => (item._id === exam._id ? data.exam : item)));
      showToast(data.exam.isCompleted ? "Exam marked complete." : "Exam returned to upcoming.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete “${exam.name}”?`)) return;
    setLoading(true);
    try {
      await api(`/exams/${exam._id}`, { method: "DELETE" });
      setExams((prev) => prev.filter((item) => item._id !== exam._id));
      showToast("Exam deleted.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const displayDate = dateForDisplay(exam.examDate);

  return (
    <article className={`card exam-card ${completed ? "completed" : ""}`}>
      <div className="exam-card-date" aria-label={formatDate(exam.examDate, { year: "numeric" })}>
        <span>{new Intl.DateTimeFormat("en", { month: "short" }).format(displayDate)}</span>
        <strong>{displayDate.getDate()}</strong>
      </div>
      <div className="exam-card-copy">
        <div className="exam-card-meta">
          <span className="topic-subject">
            <span className="subject-dot" style={{ background: subject.color || "#062f72" }}></span>
            {subject.name}
          </span>
          <span className={`priority ${exam.importance || "medium"}`}>{exam.importance || "medium"}</span>
          {completed && <span className="completed-badge">Completed</span>}
        </div>
        <h3>{exam.name}</h3>
        {exam.description ? <p>{exam.description}</p> : null}
        <div className="exam-countdown">
          {completed ? `Completed · ${formatDate(exam.examDate, { year: "numeric" })}` : relativeDayLabel(exam.examDate)}
        </div>
        {topicNames.length ? (
          <div className="syllabus-tags" aria-label="Syllabus topics">
            {topicNames.slice(0, 5).map((name, i) => (
              <span key={i}>{name}</span>
            ))}
            {topicNames.length > 5 ? <span>+{topicNames.length - 5}</span> : null}
          </div>
        ) : (
          <p className="exam-no-topics">No syllabus topics linked yet.</p>
        )}
      </div>
      <div className="exam-actions">
        <button
          className="subject-action"
          data-action="toggle-exam"
          data-id={exam._id}
          disabled={loading}
          onClick={handleToggle}
        >
          {loading ? "Saving…" : completed ? "Mark upcoming" : "Mark complete"}
        </button>
        <button
          className="subject-action"
          data-action="edit-exam"
          data-id={exam._id}
          onClick={() => openExamModal(exam)}
        >
          Edit
        </button>
        <button
          className="subject-action subject-action-muted"
          data-action="delete-exam"
          data-id={exam._id}
          disabled={loading}
          onClick={handleDelete}
        >
          {loading ? "Deleting…" : "Delete"}
        </button>
      </div>
    </article>
  );
};

import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../../context/AppContext.jsx";
import { dateOnlyKey, localDateKey } from "../../utils/dateUtils.js";

export const ExamModal = () => {
  const { modalData: exam, subjects, topics, setExams, closeModal, showToast, api } = useApp();
  const [loading, setLoading] = useState(false);
  const nameInputRef = useRef(null);

  const activeSubjects = subjects.filter((s) => !s.isArchived);

  const associationId = (val) => (typeof val === "object" ? val?._id : val);
  const examSubjectId = (e) => associationId(e?.subject);
  const selectedExamTopicIds = new Set(
    (Array.isArray(exam?.syllabusTopics) ? exam.syllabusTopics : []).map(associationId).filter(Boolean)
  );

  const [selectedSubjectId, setSelectedSubjectId] = useState(() =>
    exam ? examSubjectId(exam) : activeSubjects[0]?._id
  );
  const [selectedTopics, setSelectedTopics] = useState(selectedExamTopicIds);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const handleSubjectChange = (e) => {
    const nextSubId = e.target.value;
    setSelectedSubjectId(nextSubId);
    setSelectedTopics(new Set());
  };

  const handleCheckboxToggle = (topicId) => {
    const next = new Set(selectedTopics);
    if (next.has(topicId)) next.delete(topicId);
    else next.add(topicId);
    setSelectedTopics(next);
  };

  const topicSubjectId = (t) => associationId(t?.subject);
  const availableTopics = topics.filter(
    (t) => topicSubjectId(t) === selectedSubjectId && (!t.isArchived || selectedTopics.has(t._id))
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const values = Object.fromEntries(formData);
    values.syllabusTopics = Array.from(selectedTopics);
    const id = exam?._id;

    setLoading(true);
    try {
      const data = await api(id ? `/exams/${id}` : "/exams", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });

      if (id) {
        setExams((prev) => prev.map((eItem) => (eItem._id === id ? data.exam : eItem)));
      } else {
        setExams((prev) => [data.exam, ...prev]);
      }

      closeModal();
      showToast(id ? "Exam updated." : "Exam added.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      data-action="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && closeModal()}
    >
      <section className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="exam-modal-title">
        <div className="modal-header">
          <div>
            <h2 id="exam-modal-title">{exam ? "Edit exam" : "Add an exam"}</h2>
            <p>Keep the date and the actual syllabus together.</p>
          </div>
          <button className="btn btn-ghost icon-button" data-action="close-modal" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>

        <form id="exam-form" className="form-stack" data-id={exam?._id || ""} onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="exam-name">Exam name</label>
            <input
              ref={nameInputRef}
              id="exam-name"
              name="name"
              required
              maxLength={120}
              placeholder="Algorithms midterm"
              defaultValue={exam?.name || ""}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="exam-subject">Subject</label>
              <select
                id="exam-subject"
                name="subject"
                data-action="exam-subject"
                required
                value={selectedSubjectId}
                onChange={handleSubjectChange}
              >
                {activeSubjects.map((s) => (
                  <option key={String(s._id || s.id)} value={String(s._id || s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="exam-date">Exam date</label>
              <input
                id="exam-date"
                name="examDate"
                type="date"
                required
                defaultValue={exam?.examDate ? dateOnlyKey(exam.examDate) : localDateKey()}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="exam-description">
              Description <span className="optional">(optional)</span>
            </label>
            <textarea
              id="exam-description"
              name="description"
              maxLength={1000}
              placeholder="Format, room, or preparation notes…"
              defaultValue={exam?.description || ""}
            ></textarea>
          </div>

          <div className="field">
            <label htmlFor="exam-importance">Importance</label>
            <select id="exam-importance" name="importance" defaultValue={exam?.importance || "medium"}>
              {["low", "medium", "high"].map((imp) => (
                <option key={imp} value={imp}>
                  {imp[0].toUpperCase() + imp.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="syllabus-field">
            <legend>
              Syllabus topics <span className="optional">(optional)</span>
            </legend>
            <div id="exam-syllabus-options" className="syllabus-options">
              {availableTopics.length ? (
                availableTopics.map((t) => (
                  <label key={t._id} className={`syllabus-option ${t.isArchived ? "archived" : ""}`}>
                    <input
                      type="checkbox"
                      name="syllabusTopics"
                      value={t._id}
                      checked={selectedTopics.has(t._id)}
                      onChange={() => handleCheckboxToggle(t._id)}
                    />
                    <span>
                      <strong>{t.name}</strong>
                      {t.isArchived ? <small>Archived topic</small> : <small>Confidence {Number(t.confidence) || 1}/5</small>}
                    </span>
                  </label>
                ))
              ) : (
                <p className="field-note syllabus-empty">
                  No topics for this subject yet. You can save the exam now and link topics later.
                </p>
              )}
            </div>
          </fieldset>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" data-action="close-modal" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Saving…" : exam ? "Save changes" : "Add exam"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

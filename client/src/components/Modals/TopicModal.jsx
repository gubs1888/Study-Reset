import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../../context/AppContext.jsx";

export const TopicModal = () => {
  const { modalData: topic, subjects, setTopics, closeModal, showToast, api } = useApp();
  const [loading, setLoading] = useState(false);
  const nameInputRef = useRef(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const activeSubjects = subjects.filter((s) => !s.isArchived);

  const topicSubjectId = (t) => (typeof t?.subject === "object" ? t.subject?._id : t?.subject);
  const currentSubjectId = topic ? topicSubjectId(topic) : activeSubjects[0]?._id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const values = Object.fromEntries(formData);
    values.confidence = Number(values.confidence);
    const id = topic?._id;

    setLoading(true);
    try {
      const data = await api(id ? `/topics/${id}` : "/topics", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });

      if (id) {
        setTopics((prev) => prev.map((t) => (t._id === id ? data.topic : t)));
      } else {
        setTopics((prev) => [data.topic, ...prev]);
      }

      closeModal();
      showToast(id ? "Topic updated." : "Topic added to your revision queue.");
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
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="topic-modal-title">
        <div className="modal-header">
          <div>
            <h2 id="topic-modal-title">{topic ? "Edit topic" : "Add a revision topic"}</h2>
            <p>Use one clear concept, chapter, or skill per topic.</p>
          </div>
          <button className="btn btn-ghost icon-button" data-action="close-modal" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>

        <form id="topic-form" className="form-stack" data-id={topic?._id || ""} onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="topic-name">Topic name</label>
            <input
              ref={nameInputRef}
              id="topic-name"
              name="name"
              required
              maxLength={120}
              placeholder="Binary search trees"
              defaultValue={topic?.name || ""}
            />
          </div>

          <div className="field">
            <label htmlFor="topic-subject">Subject</label>
            <select id="topic-subject" name="subject" required defaultValue={currentSubjectId}>
              {activeSubjects.map((s) => (
                <option key={String(s._id || s.id)} value={String(s._id || s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="topic-description">
              Notes <span className="optional">(optional)</span>
            </label>
            <textarea
              id="topic-description"
              name="description"
              maxLength={1000}
              placeholder="What should a useful review cover?"
              defaultValue={topic?.description || ""}
            ></textarea>
          </div>

          <div className="field">
            <label htmlFor="topic-confidence">Current confidence</label>
            <select id="topic-confidence" name="confidence" required defaultValue={topic?.confidence || 3}>
              {[
                [1, "1 — just starting"],
                [2, "2 — shaky"],
                [3, "3 — developing"],
                [4, "4 — confident"],
                [5, "5 — strong"],
              ].map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
            <p className="field-note">Reviews will continue to update the schedule; confidence stays yours to set.</p>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" data-action="close-modal" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Saving…" : topic ? "Save changes" : "Add topic"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

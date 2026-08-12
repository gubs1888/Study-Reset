import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../../context/AppContext.jsx";

export const SubjectModal = () => {
  const { modalData: subject, setSubjects, closeModal, showToast, api } = useApp();
  const [loading, setLoading] = useState(false);
  const nameInputRef = useRef(null);

  const colors = ["#031b46", "#062f72", "#0a3d91", "#172f7a", "#1e3a8a", "#1d4ed8"];
  const [selectedColor, setSelectedColor] = useState(subject?.color || colors[0]);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const values = Object.fromEntries(formData);
    const id = subject?._id;

    setLoading(true);
    try {
      const data = await api(id ? `/subjects/${id}` : "/subjects", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });

      if (id) {
        setSubjects((prev) =>
          prev.map((s) => (s._id === id ? { ...s, ...data.subject } : s))
        );
      } else {
        setSubjects((prev) => [data.subject, ...prev]);
      }

      closeModal();
      showToast(id ? "Subject updated." : "Subject created.");
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
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="subject-modal-title">
        <div className="modal-header">
          <div>
            <h2 id="subject-modal-title">{subject ? "Edit subject" : "Create a subject"}</h2>
            <p>
              {subject
                ? "Update this learning area without changing its tasks."
                : "Organize tasks by course, exam, or learning goal."}
            </p>
          </div>
          <button className="btn btn-ghost icon-button" data-action="close-modal" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </div>

        <form id="subject-form" className="form-stack" data-id={subject?._id || ""} onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="subject-name">Subject name</label>
            <input
              ref={nameInputRef}
              id="subject-name"
              name="name"
              required
              maxLength={80}
              placeholder="Data Structures"
              defaultValue={subject?.name || ""}
            />
          </div>

          <div className="field">
            <label htmlFor="subject-description">
              Description <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span>
            </label>
            <textarea
              id="subject-description"
              name="description"
              maxLength={300}
              placeholder="What are you working toward?"
              defaultValue={subject?.description || ""}
            ></textarea>
          </div>

          <div className="field">
            <label>Color</label>
            <div className="color-picker">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-option ${color === selectedColor ? "active" : ""}`}
                  style={{ background: color }}
                  data-action="pick-color"
                  data-color={color}
                  aria-label={`Select ${color}`}
                  onClick={() => setSelectedColor(color)}
                ></button>
              ))}
            </div>
            <input type="hidden" name="color" value={selectedColor} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" data-action="close-modal" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Saving…" : subject ? "Save changes" : "Create subject"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

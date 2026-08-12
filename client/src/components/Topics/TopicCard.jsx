import React, { useState } from "react";
import { useApp } from "../../context/AppContext.jsx";
import { formatDate, relativeDayLabel, calendarDaysFromToday } from "../../utils/dateUtils.js";

export const ConfidenceMeter = ({ confidence = 1 }) => (
  <span className="confidence-meter" aria-label={`Confidence ${confidence} out of 5`}>
    {[1, 2, 3, 4, 5].map((level) => (
      <i key={level} className={level <= confidence ? "filled" : ""}></i>
    ))}
  </span>
);

export const TopicCard = ({ topic, archived = false }) => {
  const { subjects, setTopics, openTopicModal, showToast, api } = useApp();
  const [loading, setLoading] = useState(false);

  const topicSubId = typeof topic?.subject === "object" ? topic.subject?._id : topic?.subject;
  const subject = subjects.find((s) => s._id === topicSubId)
    || (topic?.subject && typeof topic.subject === "object" ? topic.subject : null)
    || { name: "Study", color: "#062f72" };

  const due = !archived && topic.nextReviewAt && calendarDaysFromToday(topic.nextReviewAt) <= 0;

  const handleReview = async (performance) => {
    setLoading(true);
    try {
      const data = await api(`/topics/${topic._id}/review`, {
        method: "POST",
        body: JSON.stringify({ performance }),
      });
      setTopics((prev) =>
        prev.map((item) => (item._id === topic._id ? { ...item, ...data.topic } : item))
      );
      showToast(data.revision?.reason || `Review saved as ${performance}.`);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!window.confirm(`Archive “${topic.name}”? Its review history will stay intact.`)) return;
    setLoading(true);
    try {
      const data = await api(`/topics/${topic._id}`, { method: "DELETE" });
      setTopics((prev) =>
        prev.map((item) =>
          item._id === topic._id ? { ...item, ...(data.topic || {}), isArchived: true } : item
        )
      );
      showToast("Topic archived.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const data = await api(`/topics/${topic._id}`, {
        method: "PATCH",
        body: JSON.stringify({ isArchived: false }),
      });
      setTopics((prev) =>
        prev.map((item) =>
          item._id === topic._id ? { ...item, ...(data.topic || {}), isArchived: false } : item
        )
      );
      showToast("Topic restored.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className={`card topic-card ${archived ? "archived" : ""} ${due ? "review-due" : ""}`}>
      <div className="topic-card-top">
        <span className="topic-subject">
          <span className="subject-dot" style={{ background: subject.color || "#062f72" }}></span>
          {subject.name}
        </span>
        {archived ? (
          <span className="archived-badge">Archived</span>
        ) : due ? (
          <span className="due-badge">Review due</span>
        ) : null}
      </div>

      <h3>{topic.name}</h3>
      <p>{topic.description || "Keep this idea in your revision rhythm."}</p>

      <div className="topic-confidence">
        <span>Confidence</span>
        <ConfidenceMeter confidence={Number(topic.confidence) || 1} />
        <strong>{Number(topic.confidence) || 1}/5</strong>
      </div>

      <dl className="review-dates">
        <div>
          <dt>Last reviewed</dt>
          <dd>{topic.lastReviewedAt ? formatDate(topic.lastReviewedAt, { year: "numeric" }) : "Not yet"}</dd>
        </div>
        <div>
          <dt>Next review</dt>
          <dd>
            {topic.nextReviewAt
              ? `${formatDate(topic.nextReviewAt, { year: "numeric" })} · ${relativeDayLabel(topic.nextReviewAt)}`
              : "Not scheduled"}
          </dd>
        </div>
      </dl>

      {archived ? (
        <div className="topic-footer">
          <button
            className="subject-action"
            data-action="restore-topic"
            data-id={topic._id}
            disabled={loading}
            onClick={handleRestore}
          >
            {loading ? "Restoring…" : "Restore topic"}
          </button>
        </div>
      ) : (
        <>
          <div className="review-actions" aria-label={`Record review performance for ${topic.name}`}>
            <span>Review result</span>
            <button
              data-action="review-topic"
              data-id={topic._id}
              data-performance="poor"
              disabled={loading}
              onClick={() => handleReview("poor")}
            >
              Poor
            </button>
            <button
              data-action="review-topic"
              data-id={topic._id}
              data-performance="fair"
              disabled={loading}
              onClick={() => handleReview("fair")}
            >
              Fair
            </button>
            <button
              data-action="review-topic"
              data-id={topic._id}
              data-performance="good"
              disabled={loading}
              onClick={() => handleReview("good")}
            >
              Good
            </button>
          </div>
          <div className="topic-footer">
            <button
              className="subject-action"
              data-action="edit-topic"
              data-id={topic._id}
              onClick={() => openTopicModal(topic)}
            >
              Edit
            </button>
            <button
              className="subject-action subject-action-muted"
              data-action="archive-topic"
              data-id={topic._id}
              disabled={loading}
              onClick={handleArchive}
            >
              {loading ? "Archiving…" : "Archive"}
            </button>
          </div>
        </>
      )}
    </article>
  );
};

import React from "react";
import { useApp } from "../../context/AppContext.jsx";
import { TopicCard } from "./TopicCard.jsx";
import { calendarDaysFromToday, dateOnlyKey } from "../../utils/dateUtils.js";

export const TopicsView = () => {
  const { topics, openTopicModal } = useApp();

  const active = topics.filter((t) => !t.isArchived);
  const archived = topics.filter((t) => t.isArchived);

  const dueTopics = active
    .filter((t) => t.nextReviewAt && calendarDaysFromToday(dateOnlyKey(t.nextReviewAt)) <= 0)
    .sort((a, b) => calendarDaysFromToday(dateOnlyKey(a.nextReviewAt)) - calendarDaysFromToday(dateOnlyKey(b.nextReviewAt)));

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Remember with intention</p>
          <h1>Topics & revision</h1>
          <p>Track confidence and review each topic at the right pace.</p>
        </div>
        <button
          className="btn btn-primary"
          data-action="new-topic"
          onClick={() => openTopicModal(null)}
        >
          + Add topic
        </button>
      </div>

      {dueTopics.length > 0 && (
        <div className="revision-banner">
          <span>↻</span>
          <div>
            <strong>{dueTopics.length} revision{dueTopics.length === 1 ? " is" : "s are"} due</strong>
            <p>Choose Poor, Fair, or Good after a real review to schedule the next one.</p>
          </div>
        </div>
      )}

      <section className="topic-grid">
        {active.length ? (
          active.map((topic) => <TopicCard key={topic._id} topic={topic} />)
        ) : (
          <div className="card collection-empty">
            <span>↻</span>
            <h3>No revision topics yet</h3>
            <p>Add a concept you want to remember and StudyReset will give it a review rhythm.</p>
            <button
              className="btn btn-small btn-primary"
              data-action="new-topic"
              onClick={() => openTopicModal(null)}
            >
              + Add topic
            </button>
          </div>
        )}
      </section>

      {archived.length > 0 && (
        <section className="archived-subjects" aria-labelledby="archived-topics-title">
          <div className="section-heading">
            <div>
              <h2 id="archived-topics-title">Archived topics</h2>
              <p>Restore a topic without losing its review history.</p>
            </div>
            <span>{archived.length}</span>
          </div>
          <div className="topic-grid archived-grid">
            {archived.map((topic) => (
              <TopicCard key={topic._id} topic={topic} archived={true} />
            ))}
          </div>
        </section>
      )}
    </>
  );
};

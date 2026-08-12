import React from "react";
import { useApp } from "../../context/AppContext.jsx";
import { SubjectCard } from "./SubjectCard.jsx";

export const SubjectsView = () => {
  const { subjects, openSubjectModal } = useApp();

  const active = subjects.filter((s) => !s.isArchived);
  const archived = subjects.filter((s) => s.isArchived);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Organize your learning</p>
          <h1>Subjects</h1>
          <p>Give every task a home and see progress by area.</p>
        </div>
        <button
          className="btn btn-primary"
          data-action="new-subject"
          onClick={() => openSubjectModal(null)}
        >
          + Add subject
        </button>
      </div>

      <section className="subject-grid">
        {active.length ? (
          active.map((subject) => <SubjectCard key={subject._id} subject={subject} />)
        ) : (
          <div className="card" style={{ gridColumn: "1/-1" }}>
            <div className="empty-state">
              <div>
                <div className="empty-state-icon">▦</div>
                <h3>Create your first subject</h3>
                <p>Organize tasks by course, exam, or any area you want to improve.</p>
                <button
                  className="btn btn-small btn-primary"
                  data-action="new-subject"
                  onClick={() => openSubjectModal(null)}
                >
                  + Add subject
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {archived.length > 0 && (
        <section className="archived-subjects" aria-labelledby="archived-subjects-title">
          <div className="section-heading">
            <div>
              <h2 id="archived-subjects-title">Archived subjects</h2>
              <p>Restore a subject whenever you are ready to study it again.</p>
            </div>
            <span>{archived.length}</span>
          </div>
          <div className="subject-grid archived-grid">
            {archived.map((subject) => (
              <SubjectCard key={subject._id} subject={subject} archived={true} />
            ))}
          </div>
        </section>
      )}
    </>
  );
};

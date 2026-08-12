import React from "react";
import { useApp } from "../../context/AppContext.jsx";
import { ExamCard } from "./ExamCard.jsx";
import { calendarDayNumber } from "../../utils/dateUtils.js";

export const ExamsView = () => {
  const { exams, openExamModal } = useApp();

  const sorted = [...exams].sort(
    (left, right) => calendarDayNumber(left.examDate) - calendarDayNumber(right.examDate)
  );
  const active = sorted.filter((exam) => !exam.isCompleted);
  const completed = sorted.filter((exam) => exam.isCompleted);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Prepare without panic</p>
          <h1>Exams</h1>
          <p>Keep dates, importance, and the syllabus visible in one calm place.</p>
        </div>
        <button
          className="btn btn-primary"
          data-action="new-exam"
          onClick={() => openExamModal(null)}
        >
          + Add exam
        </button>
      </div>

      <section className="exam-list">
        {active.length ? (
          active.map((exam) => <ExamCard key={exam._id} exam={exam} />)
        ) : (
          <div className="card collection-empty">
            <span>◇</span>
            <h3>No upcoming exams</h3>
            <p>Add a confirmed date and connect the topics you want in view.</p>
            <button
              className="btn btn-small btn-primary"
              data-action="new-exam"
              onClick={() => openExamModal(null)}
            >
              + Add exam
            </button>
          </div>
        )}
      </section>

      {completed.length > 0 && (
        <section className="completed-exams" aria-labelledby="completed-exams-title">
          <div className="section-heading">
            <div>
              <h2 id="completed-exams-title">Completed exams</h2>
              <p>Past milestones stay here until you remove them.</p>
            </div>
            <span>{completed.length}</span>
          </div>
          <div className="exam-list">
            {completed.map((exam) => (
              <ExamCard key={exam._id} exam={exam} />
            ))}
          </div>
        </section>
      )}
    </>
  );
};

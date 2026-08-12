import React from "react";
import { useApp } from "../../context/AppContext.jsx";
import { TaskItem } from "../Tasks/TaskItem.jsx";
import {
  formatDate,
  formatMinutes,
  isToday,
  dateOnlyKey,
  calendarDaysFromToday,
  calendarDayNumber,
  relativeDayLabel,
} from "../../utils/dateUtils.js";

export const TodayView = () => {
  const {
    user,
    tasks,
    subjects,
    topics,
    exams,
    focusSessions,
    checkIn,
    dailyPlan,
    setView,
    openSubjectModal,
  } = useApp();

  const firstName = (user?.name || "Student").split(" ")[0];
  const hours = new Date().getHours();
  const timeOfDay = hours < 12 ? "morning" : hours < 18 ? "afternoon" : "evening";

  const pending = tasks.filter((t) => t.status !== "completed");
  const completedToday = tasks.filter((t) => t.status === "completed" && isToday(t.completedAt));
  const dueToday = tasks.filter((t) => isToday(t.dueDate, true));

  const queueIds = new Set();
  const topTasks = [...dueToday.filter((t) => t.status !== "completed"), ...completedToday]
    .filter((t) => {
      if (queueIds.has(t._id)) return false;
      queueIds.add(t._id);
      return true;
    })
    .slice(0, 5);

  const activeSubs = subjects.filter((s) => !s.isArchived);

  const activeTopics = topics.filter((t) => !t.isArchived);
  const dueTopics = activeTopics
    .filter((t) => t.nextReviewAt && calendarDaysFromToday(dateOnlyKey(t.nextReviewAt)) <= 0)
    .sort((a, b) => calendarDayNumber(a.nextReviewAt) - calendarDayNumber(b.nextReviewAt))
    .slice(0, 3);

  const upcomingExams = exams
    .filter((e) => !e.isCompleted && calendarDaysFromToday(e.examDate) >= 0)
    .sort((a, b) => calendarDayNumber(a.examDate) - calendarDayNumber(b.examDate))
    .slice(0, 3);

  const completedMinutesToday = focusSessions
    .filter((s) => s.status === "completed" && isToday(s.endedAt || s.startedAt))
    .reduce((sum, s) => sum + (Number(s.actualFocusedMinutes) || 0), 0);

  const planBlocks = Array.isArray(dailyPlan?.blocks) ? dailyPlan.blocks : [];
  const plannedMinutes = planBlocks.reduce((sum, b) => sum + (Number(b.durationMinutes) || 0), 0);
  const completedPlanBlocks = planBlocks.filter((b) => b.status === "completed").length;
  const moodLabel = checkIn?.mood ? checkIn.mood.replace("-", " ") : "";

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Today’s workspace</p>
          <h1>Good {timeOfDay}, {firstName}.</h1>
          <p>Small, focused steps. That’s the whole plan.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <div>
          <section className="card focus-card">
            <span className="focus-label">Ready when you are</span>
            <h2>
              {pending[0]
                ? `Make progress on “${pending[0].title}”`
                : "A clear list is a fresh start"}
            </h2>
            <p>
              {pending[0]
                ? `${formatMinutes(pending[0].estimatedMinutes)} of focused work can move this forward. Put everything else down for a while.`
                : "Add one meaningful task, then use the focus room to work without the noise."}
            </p>
            <button
              className="btn btn-accent"
              data-action="navigate"
              data-view="focus"
              onClick={() => setView("focus")}
            >
              Start a focus session →
            </button>
          </section>

          <div className="stats-row">
            <article className="card stat-card">
              <div className="stat-top">
                <span className="stat-icon">✓</span>
              </div>
              <strong>{completedToday.length}</strong>
              <p>Tasks completed today</p>
            </article>
            <article className="card stat-card">
              <div className="stat-top">
                <span className="stat-icon">◷</span>
              </div>
              <strong>{formatMinutes(completedMinutesToday)}</strong>
              <p>Focused time today</p>
            </article>
            <article className="card stat-card">
              <div className="stat-top">
                <span className="stat-icon">▦</span>
              </div>
              <strong>{activeSubs.length}</strong>
              <p>Active subjects</p>
            </article>
          </div>

          <section className="card card-pad">
            <div className="card-header">
              <div>
                <h2>Today’s study queue</h2>
                <p>Tasks due today and work you completed today</p>
              </div>
              <button
                className="text-button"
                data-action="navigate"
                data-view="tasks"
                onClick={() => setView("tasks")}
              >
                View all →
              </button>
            </div>
            <div className="task-list">
              {topTasks.length ? (
                topTasks.map((task) => <TaskItem key={task._id} task={task} showDelete={false} />)
              ) : (
                <div className="empty-state">
                  <div>
                    <div className="empty-state-icon">✓</div>
                    <h3>Your study queue is clear</h3>
                    <p>Add a focused task and give your next study session a clear finish line.</p>
                    <button
                      className="btn btn-small btn-primary"
                      data-action="new-task"
                      onClick={() => setView("tasks")}
                    >
                      + Add task
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="right-column">
          <section className="card card-pad dashboard-reset-card">
            <div className="card-header">
              <div>
                <h2>Today’s reset</h2>
                <p>Plan around the capacity you actually have</p>
              </div>
              <button
                className="text-button"
                data-action="navigate"
                data-view="plan"
                onClick={() => setView("plan")}
              >
                Open →
              </button>
            </div>
            {checkIn ? (
              <>
                <div className="reset-summary">
                  <span className={`mood-orb mood-${checkIn.mood}`} aria-hidden="true"></span>
                  <div>
                    <strong>
                      {moodLabel[0]?.toUpperCase() + moodLabel.slice(1)} · energy {checkIn.energyLevel}/5
                    </strong>
                    <span>{checkIn.availableMinutes} minutes available</span>
                  </div>
                </div>
                {dailyPlan ? (
                  <div className="dashboard-plan-line">
                    <strong>
                      {completedPlanBlocks}/{planBlocks.length} blocks complete
                    </strong>
                    <span>
                      {formatMinutes(plannedMinutes)} planned · {dailyPlan.mode || "normal"} mode
                    </span>
                  </div>
                ) : (
                  <button
                    className="btn btn-small btn-primary"
                    data-action="navigate"
                    data-view="plan"
                    onClick={() => setView("plan")}
                  >
                    Generate today’s plan
                  </button>
                )}
              </>
            ) : (
              <div className="compact-empty">
                <strong>How are you arriving today?</strong>
                <p>A one-minute check-in gives your plan a realistic budget.</p>
                <button
                  className="btn btn-small btn-primary"
                  data-action="navigate"
                  data-view="plan"
                  onClick={() => setView("plan")}
                >
                  Start daily check-in
                </button>
              </div>
            )}
          </section>

          <section className="card card-pad">
            <div className="card-header">
              <div>
                <h2>Due revisions</h2>
                <p>Topics ready for another pass</p>
              </div>
              <button
                className="text-button"
                data-action="navigate"
                data-view="topics"
                onClick={() => setView("topics")}
              >
                View all →
              </button>
            </div>
            <div className="dashboard-brief-list">
              {dueTopics.length ? (
                dueTopics.map((topic) => {
                  const topicSubId = typeof topic?.subject === "object" ? topic.subject?._id : topic?.subject;
                  const subject = subjects.find((s) => s._id === topicSubId)
                    || (topic?.subject && typeof topic.subject === "object" ? topic.subject : null)
                    || { name: "Study", color: "#062f72" };
                  return (
                    <button
                      key={topic._id}
                      className="brief-row"
                      data-action="navigate"
                      data-view="topics"
                      onClick={() => setView("topics")}
                    >
                      <span className="brief-mark" style={{ background: subject.color || "#062f72" }}>
                        ↻
                      </span>
                      <span>
                        <strong>{topic.name}</strong>
                        <small>
                          {subject.name} · {relativeDayLabel(topic.nextReviewAt)}
                        </small>
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="quiet-copy">Nothing is due today. Your revision queue is clear.</p>
              )}
            </div>
          </section>

          <section className="card card-pad">
            <div className="card-header">
              <div>
                <h2>Upcoming exams</h2>
                <p>Your nearest dates at a glance</p>
              </div>
              <button
                className="text-button"
                data-action="navigate"
                data-view="exams"
                onClick={() => setView("exams")}
              >
                View all →
              </button>
            </div>
            <div className="dashboard-brief-list">
              {upcomingExams.length ? (
                upcomingExams.map((exam) => {
                  const examSubId = typeof exam?.subject === "object" ? exam.subject?._id : exam?.subject;
                  const subject = subjects.find((s) => s._id === examSubId)
                    || (exam?.subject && typeof exam.subject === "object" ? exam.subject : null)
                    || { name: "Study", color: "#062f72" };
                  return (
                    <button
                      key={exam._id}
                      className="brief-row"
                      data-action="navigate"
                      data-view="exams"
                      onClick={() => setView("exams")}
                    >
                      <span className="exam-date-tile">
                        <strong>{formatDate(exam.examDate, { day: "numeric" })}</strong>
                      </span>
                      <span>
                        <strong>{exam.name}</strong>
                        <small>
                          {subject.name} · {relativeDayLabel(exam.examDate)}
                        </small>
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="quiet-copy">No upcoming exams. Add one when a date is confirmed.</p>
              )}
            </div>
          </section>

          <section className="card card-pad">
            <div className="card-header">
              <div>
                <h2>Subjects</h2>
                <p>Your active learning areas</p>
              </div>
              <button
                className="text-button"
                data-action="new-subject"
                onClick={() => openSubjectModal(null)}
              >
                + Add
              </button>
            </div>
            <div className="subjects-mini">
              {activeSubs.length ? (
                activeSubs.slice(0, 5).map((subject) => {
                  const subTasks = tasks.filter((t) => {
                    const sId = typeof t.subject === "object" ? t.subject?._id : t.subject;
                    return sId === subject._id;
                  });
                  const done = subTasks.filter((t) => t.status === "completed").length;
                  return (
                    <div key={subject._id} className="subject-mini">
                      <div className="subject-mark" style={{ background: subject.color }}>
                        {subject.name[0]?.toUpperCase()}
                      </div>
                      <div className="subject-mini-copy">
                        <strong>{subject.name}</strong>
                        <span>
                          {done}/{subTasks.length} tasks complete
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
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
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
};

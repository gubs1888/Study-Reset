import React from "react";
import { useApp } from "../../context/AppContext.jsx";
import { initials, isToday } from "../../utils/dateUtils.js";

const icons = {
  today: "⌂",
  tasks: "✓",
  subjects: "▦",
  topics: "↻",
  exams: "◇",
  plan: "☷",
  focus: "◷",
};

export const Sidebar = () => {
  const {
    view,
    setView,
    sidebarOpen,
    setSidebarOpen,
    user,
    tasks,
    focusSessions,
    resetClientSession,
  } = useApp();

  const completed = tasks.filter((task) => task.status === "completed").length;
  const target = Math.max(user?.preferences?.dailyTargetMinutes || 120, 1);

  const completedMinutesToday = focusSessions
    .filter((s) => s.status === "completed" && isToday(s.endedAt || s.startedAt))
    .reduce((sum, s) => sum + (Number(s.actualFocusedMinutes) || 0), 0);

  const progress = Math.min(100, Math.round((completedMinutesToday / target) * 100));

  const navItems = [
    ["today", "Today"],
    ["tasks", "My tasks"],
    ["subjects", "Subjects"],
    ["topics", "Topics & revision"],
    ["exams", "Exams"],
    ["plan", "Daily plan"],
    ["focus", "Focus room"],
  ];

  return (
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="brand">
        <span className="brand-mark">↗</span> StudyReset
      </div>
      <nav className="nav-list" aria-label="Main navigation">
        {navItems.map(([vKey, label]) => {
          const isActive = view === vKey;
          return (
            <button
              key={vKey}
              className={`nav-item ${isActive ? "active" : ""}`}
              data-action="navigate"
              data-view={vKey}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                setView(vKey);
                setSidebarOpen(false);
              }}
            >
              <span className="nav-icon">{icons[vKey]}</span>
              {label}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-card">
          <p>Focused today</p>
          <strong>{completedMinutesToday} of {target} minutes</strong>
          <div className="progress">
            <span style={{ width: `${progress}%` }}></span>
          </div>
        </div>
        <div className="user-menu">
          <div className="avatar">{initials(user?.name)}</div>
          <div className="user-copy">
            <strong>{user?.name}</strong>
            <span>{completed} tasks completed</span>
          </div>
          <button
            className="task-action"
            data-action="logout"
            aria-label="Log out"
            title="Log out"
            onClick={resetClientSession}
          >
            ↪
          </button>
        </div>
      </div>
    </aside>
  );
};

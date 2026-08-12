import React from "react";
import { useApp } from "../../context/AppContext.jsx";

export const Topbar = () => {
  const { search, setSearch, sidebarOpen, setSidebarOpen, openTaskModal } = useApp();

  const formattedDate = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <header className="topbar">
      <button
        className="btn btn-outline icon-button mobile-menu"
        data-action="menu"
        aria-label="Open menu"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        ☰
      </button>
      <div className="date-copy">{formattedDate}</div>
      <div className="top-actions">
        <label className="search">
          <span>⌕</span>
          <span className="sr-only">Search tasks</span>
          <input
            id="task-search"
            placeholder="Search your tasks"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          className="btn btn-deep btn-small"
          data-action="new-task"
          onClick={() => openTaskModal(null)}
        >
          + New task
        </button>
      </div>
    </header>
  );
};

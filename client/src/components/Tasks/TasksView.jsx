import React from "react";
import { useApp } from "../../context/AppContext.jsx";
import { TaskItem } from "./TaskItem.jsx";

export const TasksView = () => {
  const {
    tasks,
    subjects,
    taskFilter,
    setTaskFilter,
    search,
    openTaskModal,
    openSubjectModal,
  } = useApp();

  const filteredTasks = tasks.filter((task) => {
    const matchesStatus = taskFilter === "all" || task.status === taskFilter;
    const subjectId = typeof task.subject === "object" ? task.subject?._id : task.subject;
    const subject = subjects.find((s) => s._id === subjectId)
      || (task.subject && typeof task.subject === "object" ? task.subject : null)
      || { name: "Study", color: "#062f72" };
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${task.title} ${task.description || ""} ${subject.name}`.toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });

  const filterOptions = [
    ["all", "All tasks"],
    ["pending", "To do"],
    ["in-progress", "In progress"],
    ["completed", "Completed"],
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Plan with intention</p>
          <h1>My tasks</h1>
          <p>Keep the next step visible and everything else quiet.</p>
        </div>
        <button
          className="btn btn-primary"
          data-action="new-task"
          onClick={() => openTaskModal(null)}
        >
          + Add study task
        </button>
      </div>

      <div className="filter-row">
        {filterOptions.map(([filter, label]) => (
          <button
            key={filter}
            className={`filter-chip ${taskFilter === filter ? "active" : ""}`}
            data-action="filter"
            data-filter={filter}
            onClick={() => setTaskFilter(filter)}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="card full-list-card">
        <div className="task-list">
          {filteredTasks.length ? (
            filteredTasks.map((task) => <TaskItem key={task._id} task={task} />)
          ) : (
            <div className="empty-state">
              <div>
                <div className="empty-state-icon">✓</div>
                <h3>Your study queue is clear</h3>
                <p>Add a focused task and give your next study session a clear finish line.</p>
                <button
                  className="btn btn-small btn-primary"
                  data-action="new-task"
                  onClick={() => openTaskModal(null)}
                >
                  + Add task
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
};

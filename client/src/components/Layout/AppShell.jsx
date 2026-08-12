import React from "react";
import { useApp } from "../../context/AppContext.jsx";
import { Sidebar } from "./Sidebar.jsx";
import { Topbar } from "./Topbar.jsx";
import { TodayView } from "../Today/TodayView.jsx";
import { TasksView } from "../Tasks/TasksView.jsx";
import { SubjectsView } from "../Subjects/SubjectsView.jsx";
import { TopicsView } from "../Topics/TopicsView.jsx";
import { ExamsView } from "../Exams/ExamsView.jsx";
import { PlanView } from "../Plan/PlanView.jsx";
import { FocusView } from "../Focus/FocusView.jsx";

export const AppShell = () => {
  const { view } = useApp();

  const renderPage = () => {
    switch (view) {
      case "today":
        return <TodayView />;
      case "tasks":
        return <TasksView />;
      case "subjects":
        return <SubjectsView />;
      case "topics":
        return <TopicsView />;
      case "exams":
        return <ExamsView />;
      case "plan":
        return <PlanView />;
      case "focus":
        return <FocusView />;
      default:
        return <TodayView />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-area">
        <Topbar />
        <div id="page-content">{renderPage()}</div>
      </main>
    </div>
  );
};

import React from "react";
import { useApp } from "./context/AppContext.jsx";
import { AuthPage } from "./components/Auth/AuthPage.jsx";
import { AppShell } from "./components/Layout/AppShell.jsx";
import { ToastRegion } from "./components/Toast/ToastRegion.jsx";
import { ModalRoot } from "./components/Modals/ModalRoot.jsx";

export const AppContent = () => {
  const { token, user, loading } = useApp();

  if (loading && token) {
    return (
      <div className="loading-screen">
        <div className="brand">
          <span className="brand-mark">↗</span> StudyReset
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <>
        <AuthPage />
        <ToastRegion />
        <ModalRoot />
      </>
    );
  }

  return (
    <>
      <AppShell />
      <ToastRegion />
      <ModalRoot />
    </>
  );
};

export default AppContent;

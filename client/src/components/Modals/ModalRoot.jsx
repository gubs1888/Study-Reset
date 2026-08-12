import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { useApp } from "../../context/AppContext.jsx";
import { TaskModal } from "./TaskModal.jsx";
import { SubjectModal } from "./SubjectModal.jsx";
import { TopicModal } from "./TopicModal.jsx";
import { ExamModal } from "./ExamModal.jsx";

export const ModalRoot = () => {
  const { activeModal, closeModal } = useApp();
  const modalRoot = document.querySelector("#modal-root");

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeModal]);

  if (!modalRoot || !activeModal) return null;

  let modalContent = null;
  if (activeModal === "task") modalContent = <TaskModal />;
  else if (activeModal === "subject") modalContent = <SubjectModal />;
  else if (activeModal === "topic") modalContent = <TopicModal />;
  else if (activeModal === "exam") modalContent = <ExamModal />;

  return ReactDOM.createPortal(modalContent, modalRoot);
};

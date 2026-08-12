import React from "react";
import ReactDOM from "react-dom";
import { useApp } from "../../context/AppContext.jsx";

export const ToastRegion = () => {
  const { toasts } = useApp();
  const modalRoot = document.querySelector("#toast-region");

  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <>
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type === "error" ? "error" : ""}`}>
          {toast.message}
        </div>
      ))}
    </>,
    modalRoot
  );
};

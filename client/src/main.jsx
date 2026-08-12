import React from "react";
import ReactDOM from "react-dom/client";
import { AppProvider } from "./context/AppContext.jsx";
import App from "./App.jsx";
import "../styles.css";

const rootElement = document.getElementById("app");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </React.StrictMode>
  );
}

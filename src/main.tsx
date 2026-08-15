import React from "react";
import ReactDOM from "react-dom/client";
import AuthGate from "../app/components/AuthGate";
import "../app/globals.css";

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AuthGate />
    </React.StrictMode>
  );
}

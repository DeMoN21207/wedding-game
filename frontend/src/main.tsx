import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

function enableLiteModeForWeakDevices(): void {
  const deviceMemory = navigator.deviceMemory ?? 8;
  const hardwareConcurrency = navigator.hardwareConcurrency ?? 8;

  if (deviceMemory <= 4 || hardwareConcurrency <= 4) {
    document.documentElement.classList.add("lite");
  }
}

enableLiteModeForWeakDevices();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

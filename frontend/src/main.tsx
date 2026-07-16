import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

const LEGACY_PWA_CACHE_NAMES = ["wedding-photos-shell-v1"];

function enableLiteModeForWeakDevices(): void {
  const deviceMemory = navigator.deviceMemory ?? 8;
  const hardwareConcurrency = navigator.hardwareConcurrency ?? 8;

  if (deviceMemory <= 4 || hardwareConcurrency <= 4) {
    document.documentElement.classList.add("lite");
  }
}

function cleanupLegacyPwaState(): void {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => undefined);
  }

  if ("caches" in window) {
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => LEGACY_PWA_CACHE_NAMES.includes(key)).map((key) => caches.delete(key))))
      .catch(() => undefined);
  }
}

enableLiteModeForWeakDevices();
cleanupLegacyPwaState();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

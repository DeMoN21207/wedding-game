import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const appBasePath = process.env.VITE_APP_BASE_PATH ?? "/events/";
const backendProxyTarget = process.env.VITE_BACKEND_PROXY_TARGET ?? "http://127.0.0.1:8000";
const normalizedBasePath = appBasePath.replace(/\/$/, "");
const proxy = {
  "/api": backendProxyTarget,
  "/media": backendProxyTarget,
  ...(normalizedBasePath
    ? {
        [`${normalizedBasePath}/api`]: backendProxyTarget,
        [`${normalizedBasePath}/media`]: backendProxyTarget
      }
    : {})
};

export default defineConfig({
  base: appBasePath,
  build: {
    assetsInlineLimit: 0
  },
  plugins: [react()],
  server: {
    proxy
  },
  preview: {
    proxy
  }
});

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiBase = (env.VITE_API_BASE ?? "").trim();
  const shouldProxy = apiBase.length === 0;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: shouldProxy
        ? {
            "/api": {
              target: "http://127.0.0.1:8787",
              changeOrigin: true
            }
          }
        : undefined
    }
  };
});

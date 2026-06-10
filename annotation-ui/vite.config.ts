import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// For GitHub Pages, the workflow sets BASE_PATH to /<repository-name>/.
// For local development, it stays as "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

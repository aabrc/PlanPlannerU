import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves this repository under /PlanPlannerU/.
// Local development keeps the root path.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS === "true" ? "/PlanPlannerU/" : "/"
});

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://sampleclaudeexams.com",
  output: "static",
  devToolbar: {
    enabled: false,
  },
  integrations: [react()],
  vite: {
    cacheDir: "node_modules/.vite/sample-claude-exams",
    plugins: [tailwindcss()],
  },
});

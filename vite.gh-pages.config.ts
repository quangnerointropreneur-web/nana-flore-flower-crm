import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/nana-flore-flower-crm/",
  build: {
    outDir: "dist-pages",
  },
});

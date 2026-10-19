import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base: the same build serves from ambrealison.github.io/Altera-demo-tool/
// and from a custom domain at its root, with no rebuild.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", assetsInlineLimit: 0 },
});

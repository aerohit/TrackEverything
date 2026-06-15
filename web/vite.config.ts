import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  // Vitest: pure-logic unit tests run in node.
  test: { environment: "node", include: ["src/**/*.{test,spec}.ts"] },
});

import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // SPA: a static shell the Hono service serves, with a client-side fallback.
    adapter: adapter({ fallback: "index.html" }),
  },
};

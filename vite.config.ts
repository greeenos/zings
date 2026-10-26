import { defineConfig } from "vite";
import path from "path";

// "react" and "react-dom" are npm aliases of @preact/compat (see package.json):
// React's API, Preact's size, for our code and every dependency alike.
export const alias = { "@": path.resolve(__dirname, "./src") };

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 9999,
    // Allow access through Tailscale Serve (https://<host>.<tailnet>.ts.net).
    allowedHosts: [".ts.net"],
    hmr: {
      overlay: false,
    },
    // `pocketbase serve` next to `npm run dev` provides the API and admin UI.
    proxy: { "/api": "http://127.0.0.1:8090", "/_": "http://127.0.0.1:8090" },
  },
  preview: {
    host: "0.0.0.0",
    port: 9999,
    allowedHosts: [".ts.net"],
  },
  resolve: { alias },
  build: {
    // PocketBase serves the built app from here.
    outDir: "pb_public",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      // Radix and cmdk ship "use client" for React Server Components; meaningless here.
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    },
  },
  esbuild: {
    legalComments: "none",
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
}));

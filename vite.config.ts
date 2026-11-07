import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { loadEnv } from "vite";
import { readSupabaseConfig } from "./src/lib/supabase-config";

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), "VITE_");
  const url = process.env.VITE_SUPABASE_URL ?? loaded.VITE_SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    loaded.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    loaded.VITE_SUPABASE_ANON_KEY;
  if (url || key) {
    const config = readSupabaseConfig(url, key);
    if (config.error) throw new Error(config.error);
  }
  return {
    base: process.env.VITE_BASE_PATH || loaded.VITE_BASE_PATH || "/",
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        includeAssets: ["nexo-logo.png", "nexo-mark.svg", "apple-touch-icon.png"],
        manifest: {
          id: ".",
          name: "NEXO Gestão",
          short_name: "NEXO",
          description: "Sua empresa organizada, em qualquer tela.",
          lang: "pt-BR",
          start_url: ".",
          scope: ".",
          display: "standalone",
          theme_color: "#176cf5",
          background_color: "#f3f7fc",
          icons: [
            {
              src: "icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/auth\//],
          cleanupOutdatedCaches: true,
          runtimeCaching: [],
        },
      }),
    ],
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/@supabase/")) return "supabase";
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id))
              return "react";
            if (id.includes("node_modules/lucide-react/")) return "icons";
          },
        },
      },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      clearMocks: true,
    },
  };
});

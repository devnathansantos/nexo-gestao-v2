import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages hospeda repositórios de projeto em /<nome-do-repositório>/.
// O workflow define VITE_BASE_PATH; para desenvolvimento local usamos '/'.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@supabase/')) return 'supabase';
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) return 'react-vendor';
        },
      },
    },
  },
});

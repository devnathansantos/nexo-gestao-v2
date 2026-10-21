import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local development uses /. GitHub Pages supplies /<repository-name>/ at build time.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
});

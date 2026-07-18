import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Vite configuration with a repository-path base for GitHub Pages. */
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/WhatsappAuto/' : '/',
});


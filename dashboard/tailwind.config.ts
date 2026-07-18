import type { Config } from 'tailwindcss';

/** Tailwind's scan configuration for the dashboard source tree. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;


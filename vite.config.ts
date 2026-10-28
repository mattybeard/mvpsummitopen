import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Matches how Static Web Apps serves the managed API under /api.
    proxy: { '/api': 'http://localhost:7071' },
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Proxy API routes without intercepting shared modules in api/src.
    proxy: { '^/api/guesses(?:/|$)': 'http://localhost:7071' },
  },
});

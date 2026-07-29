import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  preview: {
    port: process.env.PORT || 4173,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Reduce chunk size warnings
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  },
  // Handle SPA routing - redirect all routes to index.html
  appType: 'spa',
  // Vitest: covers src/ unit tests AND the pure edge-function logic module
  // (supabase/functions/*/logic.test.ts), which is dependency-free TypeScript.
  test: {
    include: [
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'supabase/functions/**/*.test.ts'
    ],
    environment: 'node'
  }
});

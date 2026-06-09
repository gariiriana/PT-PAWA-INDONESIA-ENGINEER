import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Shared config that apps can extend
export const sharedViteConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
  },
  define: {
    'process.env': {},
  },
});

export default sharedViteConfig;

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // We want to generate a single JS bundle to inject into compiler.html
    rollupOptions: {
      input: 'react-workspace/index.tsx',
      output: {
        entryFileNames: 'js/workspace.bundle.js',
        assetFileNames: 'css/[name].[ext]'
      }
    },
    outDir: '.', // Output into the frontend dir directly
    emptyOutDir: false, // Don't empty the frontend directory!
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': '/react-workspace'
    }
  }
});

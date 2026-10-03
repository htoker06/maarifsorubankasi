import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    chunkSizeWarningLimit: 2500, // pdfmake fontları büyük; yalnızca dışa aktarımda yüklenir
  },
  test: {
    environment: 'node',
  },
});

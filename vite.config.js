import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 3000,
    // Comment out the following line if you don't want `npm run dev` to open the browser:
    open: "/examples/preview.html"
  },
  clearScreen: false,
});

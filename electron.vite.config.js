import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Only the main process: the app has no window. Its entry point is found by
// convention, src/main/index.js.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
});

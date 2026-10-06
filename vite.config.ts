import { defineConfig } from 'vite';

export default defineConfig({
  // Root is already the project root
  build: {
    target: 'es2020',
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Code-split each scene into its own chunk
        manualChunks: {
          three: ['three'],
          gsap:  ['gsap'],
          'scene-boot':   ['./src/scenes/BootScene'],
          'scene-rooftop':['./src/scenes/RooftopScene'],
          'scene-desk':   ['./src/scenes/DeskScene'],
          'scene-board':  ['./src/scenes/BoardScene'],
          'scene-street': ['./src/scenes/StreetScene'],
        },
      },
    },
    // Report gzip sizes
    reportCompressedSize: true,
  },

  // Vite can handle raw GLSL imports if needed — for now shaders are inline strings
  // but this allows future file-based imports:
  assetsInclude: ['**/*.glsl'],

  server: {
    port: 5173,
    open: true,
  },
});

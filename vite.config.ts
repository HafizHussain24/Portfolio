import { defineConfig } from 'vite';

export default defineConfig({
  // Root is already the project root
  build: {
    target: 'es2020',
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Code-split each scene into its own chunk
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/gsap')) return 'gsap';
          if (id.includes('src/scenes/BootScene')) return 'scene-boot';
          if (id.includes('src/scenes/RooftopScene')) return 'scene-rooftop';
          if (id.includes('src/scenes/DeskScene')) return 'scene-desk';
          if (id.includes('src/scenes/BoardScene')) return 'scene-board';
          if (id.includes('src/scenes/StreetScene')) return 'scene-street';
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

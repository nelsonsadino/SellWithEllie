import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'analyze' &&
      visualizer({
        filename: 'dist/bundle-stats.html',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        // Vendor code changes far less often than app code now that the
        // three site entries and the admin/platform panels are route-split
        // (see main.jsx / AdminDashboardPage.jsx / PlatformDashboardPage.jsx)
        // - keeping it in its own chunk lets it stay cached across deploys.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/react-router-dom|react-router|@microsoft\/signalr|\/react\/|\/react-dom\//.test(id)) {
              return 'vendor'
            }
          }
        },
      },
    },
  },
}))

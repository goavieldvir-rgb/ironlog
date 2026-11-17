import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One id per build. The app compares the id it was built with against
// version.json on the server to notice that a newer version is live.
const BUILD_ID = process.env.GITHUB_SHA || String(Date.now())

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ironlog-version-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) })
      },
    },
  ],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  base: './',
})

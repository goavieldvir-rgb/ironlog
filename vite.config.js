import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build works from any GitHub Pages project path
// (https://<user>.github.io/<repo>/) without extra configuration.
export default defineConfig({
  plugins: [react()],
  base: './',
})

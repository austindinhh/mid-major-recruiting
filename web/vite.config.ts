import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the site from the repo's subpath.
export default defineConfig({
  base: '/mid-major-recruiting/',
  plugins: [react()],
})

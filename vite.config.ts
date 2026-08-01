import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' — GitHub Pages зэрэг дэд зам (username.github.io/repo/) дээр ажиллуулахад
// бүх asset-ийн зам relative байх ёстой (HashRouter тул хуудасны зам үл өөрчлөгдөнө)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // GitHub Pages нь main branch-ийн /docs хавтаснаас сайт үзүүлдэг
    outDir: 'docs',
  },
})

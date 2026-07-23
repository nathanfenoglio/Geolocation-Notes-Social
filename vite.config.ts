import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['66be-2600-1700-640-4100-cd44-6cfe-f6b7-a5d9.ngrok-free.app'],
  }
})

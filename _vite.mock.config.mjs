import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
export default defineConfig({
  root: '/home/claude/repo/thirteen-heights-portal-main',
  plugins: [react()],
  resolve: { alias: [{ find: /^(\.\.?\/)+supabase$/, replacement: '/tmp/claude-0/-home-claude/991ea2ee-3a57-54f1-bd0e-c5bcf4e71144/scratchpad/mock/supabase.js' }] },
})

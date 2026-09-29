import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const backendTarget = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000';
// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        host: '0.0.0.0',
        port: 3000,
        proxy: {
            '/api': {
                target: backendTarget,
                changeOrigin: true
            },
            '/ws': {
                target: backendTarget.replace(/^http/, 'ws'),
                ws: true,
                changeOrigin: true
            }
        }
    }
});

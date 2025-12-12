import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// SECURITY WARNING:
// DO NOT set API keys in environment variables for PRODUCTION deployments!
// If you set GEMINI_API_KEY/OPENAI_API_KEY etc during build on Vercel/Netlify etc, 
// they will be bundled into the JavaScript and visible to anyone via F12 DevTools.
//
// For production deployments:
// - Leave all API_KEY env vars UNSET on your hosting platform
// - Users should enter their API keys via the app's Settings UI
// - Keys entered in the UI are stored in localStorage (stays in browser only)
//
// For local development only:
// - You may use .env file with GEMINI_API_KEY, OPENAI_API_KEY etc.

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    // Only inject environment variables in development mode
    // In production builds, these will be empty strings to ensure no API keys are bundled
    const isDevelopment = mode === 'development';
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(isDevelopment ? (env.GEMINI_API_KEY || '') : ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(isDevelopment ? (env.GEMINI_API_KEY || '') : ''),
        'process.env.OPENAI_API_KEY': JSON.stringify(isDevelopment ? (env.OPENAI_API_KEY || '') : ''),
        'process.env.ANTHROPIC_API_KEY': JSON.stringify(isDevelopment ? (env.ANTHROPIC_API_KEY || '') : ''),
        'process.env.DEEPSEEK_API_KEY': JSON.stringify(isDevelopment ? (env.DEEPSEEK_API_KEY || '') : ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

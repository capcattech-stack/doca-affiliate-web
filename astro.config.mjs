// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

// Ensure @astrojs/vercel/serverless always targets nodejs20.x on Vercel
Object.defineProperty(process, 'version', { value: 'v20.18.0' });

// https://astro.build/config
export default defineConfig({
  output: 'hybrid',
  adapter: vercel()
});

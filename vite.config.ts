import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rawCommitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  process.env.BUILD_COMMIT_SHA ??
  'local';
const buildCommitSha = /^[0-9a-f]{40}$/i.test(rawCommitSha) ? rawCommitSha.toLowerCase() : 'local';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'build-commit-provenance',
      transformIndexHtml: {
        order: 'pre',
        handler: () => [
          {
            tag: 'meta',
            attrs: { name: 'build-commit-sha', content: buildCommitSha },
            injectTo: 'head',
          },
        ],
      },
    },
  ],
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
  },
});

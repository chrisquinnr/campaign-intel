import { sveltekit } from '@sveltejs/kit/vite';
import type { UserConfig } from 'vite';

const config: UserConfig = {
  plugins: [sveltekit()],
  server: {
    allowedHosts: ['a606-85-57-53-202.ngrok-free.app']
  }
};

export default config;

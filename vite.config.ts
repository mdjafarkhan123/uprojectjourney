import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			// Compile `<style lang="scss">` blocks through Sass. Without this,
			// component SCSS (BEM nesting, `//` comments) is passed through as
			// plain CSS and silently fails.
			preprocess: vitePreprocess(),
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			},

			// Deploying to Vercel, so use the Vercel adapter explicitly.
			// See https://svelte.dev/docs/kit/adapter-vercel for options (runtime, regions, etc.).
			adapter: adapter(),
			experimental: { remoteFunctions: true, handleRenderingErrors: true }
		})
	]
});

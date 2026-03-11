import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['test/**/*.test.ts'],
		setupFiles: ['test/setup.ts'],
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
			'@repo/data-ops': path.resolve(__dirname, '../../packages/data-ops/src'),
		},
	},
});

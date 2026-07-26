import { defineConfig, devices } from '@playwright/test';

const useSystemChrome = process.platform === 'darwin' && !process.env.CI;

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: !process.env.CI
	},
	use: {
		baseURL: 'http://127.0.0.1:4173',
		...devices['Desktop Chrome'],
		...(useSystemChrome ? { channel: 'chrome' as const } : {})
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				...(useSystemChrome ? { channel: 'chrome' as const } : {})
			}
		}
	],
	testMatch: '**/*.e2e.{ts,js}'
});

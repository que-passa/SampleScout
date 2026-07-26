import { expect, test } from '@playwright/test';

test.describe('auth splash gate', () => {
	test('unauthenticated home shows splash, not Capture shell', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'SampleScout' })).toBeVisible();
		await expect(
			page.getByRole('button', { name: /Connect Audiotool|Checking connection/ })
		).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
	});

	test('unauthenticated capture, drafts, and account show splash', async ({ page }) => {
		for (const path of ['/capture', '/drafts', '/account']) {
			await page.goto(path);
			await expect(page.getByRole('heading', { name: 'SampleScout' })).toBeVisible();
			await expect(
				page.getByRole('button', { name: /Connect Audiotool|Checking connection/ })
			).toBeVisible();
			await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
		}
	});

	// Authenticated AppShell (Capture stack + Account overlay) requires a real OAuth session.
});

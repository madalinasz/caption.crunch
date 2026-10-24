import { expect, test } from '@playwright/test';

const SRT = `1\n00:00:00,200 --> 00:00:01,800\nBienvenue à München\nDeuxième ligne\n\n2\n00:00:02,000 --> 00:00:03,000\nZażółć gęślą jaźń — 你好\n`;

test('loads translated SRT and updates the grouped style controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Make translated training videos/ })).toBeVisible();
  await expect(page.getByText('Files stay on this device')).toBeVisible();

  await page.locator('#srt-input').setInputFiles({ name: 'translated-de.srt', mimeType: 'application/x-subrip', buffer: Buffer.from(SRT) });
  await expect(page.locator('#srt-summary')).toContainText('2 subtitles');

  const medium = page.getByRole('radio', { name: 'Medium' });
  const large = page.getByRole('radio', { name: 'Large' });
  await expect(medium).toHaveAttribute('aria-checked', 'true');
  await large.click();
  await expect(large).toHaveAttribute('aria-checked', 'true');
  await expect(medium).toHaveAttribute('aria-checked', 'false');

  await page.locator('#language-suffix').fill('de-DE');
  await expect(page.locator('#filename-example')).toHaveText('training_de-DE.mp4');
  await page.locator('#position').fill('18');
  await expect(page.locator('#position-value')).toHaveText('18% from bottom');
});

test('shows clear validation and can reset without reloading', async ({ page }) => {
  await page.goto('/');
  await page.locator('#srt-input').setInputFiles({ name: 'broken.srt', mimeType: 'text/plain', buffer: Buffer.from('not an srt') });
  await expect(page.locator('#message')).toContainText('timestamp');
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.locator('#message')).toBeHidden();
  await expect(page.locator('#srt-summary')).toHaveText('SRT subtitles');
});

import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const SRT = `1\n00:00:00,200 --> 00:00:01,800\nBienvenue à München\nDeuxième ligne\n\n2\n00:00:02,000 --> 00:00:03,000\nZażółć gęślą jaźń — 你好\n`;
const VTT = `WEBVTT\n\n00:00.200 --> 00:01.800\n<v Ann>VTT preview works\n`;

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
  await expect(page.locator('#srt-summary')).toHaveText('SRT or VTT subtitles');
});

test('loads VTT and immediately reveals captions in the video preview', async ({ page }) => {
  await page.goto('/');
  await page.locator('#video-input').setInputFiles(resolve('tests/fixtures/source-with-audio.mp4'));
  await page.locator('#srt-input').setInputFiles({
    name: 'translated-en.vtt',
    mimeType: 'text/vtt',
    buffer: Buffer.from(VTT),
  });

  await expect(page.locator('#srt-summary')).toContainText('translated-en.vtt');
  await expect.poll(() => page.locator('#video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(0.2);

  const visibleCaptionPixels = await page.locator('#subtitle-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let alphaPixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) alphaPixels += 1;
    }
    return alphaPixels;
  });
  expect(visibleCaptionPixels).toBeGreaterThan(20);

  const layers = await page.locator('#video-stage').evaluate((stage) => {
    const video = stage.querySelector('video');
    const canvas = stage.querySelector('canvas');
    return {
      video: Number(getComputedStyle(video!).zIndex),
      canvas: Number(getComputedStyle(canvas!).zIndex),
    };
  });
  expect(layers.canvas).toBeGreaterThan(layers.video);
});

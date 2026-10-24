import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const fixturePath = resolve('tests/fixtures/source-with-audio.mp4');
const subtitlePath = resolve('tests/fixtures/accented.srt');

async function generateFixture(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/tests/fixture-generator.html');
  await page.waitForFunction(() => Boolean(window.testMedia));
  const bytes = await page.evaluate(async () => Array.from(await window.testMedia.generateFixture()));
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, new Uint8Array(bytes));
}

async function readOutputBytes(page: import('@playwright/test').Page): Promise<number[]> {
  return page.locator('#download').evaluate(async (link) => {
    const response = await fetch((link as HTMLAnchorElement).href);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  });
}

async function previewCaptionHeight(page: import('@playwright/test').Page): Promise<number> {
  await page.locator('#video').evaluate(async (video) => {
    const media = video as HTMLVideoElement;
    await new Promise<void>((resolve) => {
      media.addEventListener('seeked', () => resolve(), { once: true });
      media.currentTime = 0.75;
    });
  });
  return page.locator('#subtitle-canvas').evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext('2d');
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, target.width, target.height).data;
    let minY = target.height;
    let maxY = -1;
    for (let y = 0; y < target.height; y += 1) {
      for (let x = 0; x < target.width; x += 1) {
        const offset = (y * target.width + x) * 4;
        if (pixels[offset] > 205 && pixels[offset + 1] > 205 && pixels[offset + 2] > 205 && pixels[offset + 3] > 0) {
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    return maxY >= minY ? maxY - minY + 1 : 0;
  });
}

test('burns all three caption sizes into valid MP4s, matches preview proportions, and preserves audio', async ({ page }) => {
  test.setTimeout(180_000);
  await generateFixture(page);
  await page.goto('/');
  await page.locator('#video-input').setInputFiles(fixturePath);
  await page.locator('#srt-input').setInputFiles(subtitlePath);
  await page.locator('#language-suffix').fill('de');
  await expect(page.locator('#generate')).toBeEnabled();

  const outputs: Array<{ size: string; bytes: number[]; previewHeight: number }> = [];
  for (const size of ['Small', 'Medium', 'Large']) {
    await page.getByRole('radio', { name: size }).click();
    const previewHeight = await previewCaptionHeight(page);
    await page.locator('#generate').click();
    await expect(page.locator('#download-area')).toBeVisible({ timeout: 150_000 });
    await expect(page.locator('#download')).toHaveAttribute('download', 'source-with-audio_de.mp4');
    outputs.push({ size, bytes: await readOutputBytes(page), previewHeight });
  }

  await writeFile(resolve('test-results/captioned-output.mp4'), new Uint8Array(outputs[1].bytes));
  await page.goto('/tests/fixture-generator.html');
  await page.waitForFunction(() => Boolean(window.testMedia));
  const inspections = [];
  for (const output of outputs) {
    inspections.push(await page.evaluate((bytes) => window.testMedia.inspectMedia(bytes), output.bytes));
  }

  for (let index = 0; index < inspections.length; index += 1) {
    const inspection = inspections[index];
    expect(inspection.width).toBe(320);
    expect(inspection.height).toBe(180);
    expect(inspection.duration).toBeGreaterThan(2.9);
    expect(inspection.duration).toBeLessThan(3.2);
    expect(inspection.hasAudio).toBe(true);
    expect(inspection.captionPixelCount).toBeGreaterThan(25);
    expect(inspection.captionPixelCount).toBeGreaterThan(inspection.gapPixelCount + 20);
    expect(Math.abs(inspection.captionBoundsHeight - outputs[index].previewHeight)).toBeLessThanOrEqual(3);
  }
  expect(inspections[0].captionBoundsHeight).toBeLessThan(inspections[1].captionBoundsHeight);
  expect(inspections[1].captionBoundsHeight).toBeLessThan(inspections[2].captionBoundsHeight);
});

export {};

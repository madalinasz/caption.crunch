import { describe, expect, it } from 'vitest';
import { fontSizeFor, wrapLine } from '../src/render-subtitles';

describe('subtitle rendering maths', () => {
  it('scales all three sizes with the video resolution', () => {
    expect(fontSizeFor(1080, 'small')).toBeLessThan(fontSizeFor(1080, 'medium'));
    expect(fontSizeFor(1080, 'medium')).toBeLessThan(fontSizeFor(1080, 'large'));
    expect(fontSizeFor(1080, 'medium')).toBe(fontSizeFor(540, 'medium') * 2);
  });

  it('wraps text without losing words', () => {
    const context = { measureText: (text: string) => ({ width: text.length * 10 }) } as CanvasRenderingContext2D;
    expect(wrapLine(context, 'one two three', 75)).toEqual(['one two', 'three']);
  });
});

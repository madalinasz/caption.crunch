import { describe, expect, it } from 'vitest';
import { cleanSuffix, fileStem, outputFilename } from '../src/filename';

describe('output filenames', () => {
  it('keeps the source stem and adds a language suffix', () => {
    expect(outputFilename('Safety training.v2.mp4', 'de-DE')).toBe('Safety training.v2_de-DE.mp4');
  });

  it('sanitises separators and provides a default', () => {
    expect(cleanSuffix('__ Português (BR) ')).toBe('Português-BR');
    expect(outputFilename('intro.mp4', '')).toBe('intro_captioned.mp4');
    expect(fileStem('.mp4')).toBe('captioned-video');
  });
});

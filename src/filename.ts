export function fileStem(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, '');
  return withoutExtension || 'captioned-video';
}

export function cleanSuffix(value: string): string {
  return value.trim().replace(/^_+/, '').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}

export function outputFilename(inputFilename: string, suffix: string): string {
  const clean = cleanSuffix(suffix);
  return `${fileStem(inputFilename)}${clean ? `_${clean}` : '_captioned'}.mp4`;
}

import type { SubtitleCue } from './types';

const TIMESTAMP_LINE = /^\s*((?:\d{1,3}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,3}:)?\d{1,2}:\d{2}[,.]\d{1,3})(?:\s+.*)?$/;

export type SubtitleFormat = 'srt' | 'vtt';

export class SubtitleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubtitleParseError';
  }
}

export { SubtitleParseError as SrtParseError };

export function parseTimestamp(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length !== 2 && parts.length !== 3) {
    throw new SubtitleParseError(`Invalid timestamp “${value}”.`);
  }

  const [hours, minutes, seconds] = parts.length === 3
    ? parts.map(Number)
    : [0, Number(parts[0]), Number(parts[1])];
  if (![hours, minutes, seconds].every(Number.isFinite) || minutes >= 60 || seconds >= 60) {
    throw new SubtitleParseError(`Invalid timestamp “${value}”.`);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function parseCueLines(lines: string[], format: SubtitleFormat, startIndex = 0): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let index = startIndex;

  while (index < lines.length) {
    while (index < lines.length && lines[index].trim() === '') index += 1;
    if (index >= lines.length) break;

    if (format === 'vtt' && /^(?:NOTE(?:\s.*)?|STYLE|REGION)$/i.test(lines[index].trim())) {
      while (index < lines.length && lines[index].trim() !== '') index += 1;
      continue;
    }

    let id = String(cues.length + 1);
    let timestampMatch = lines[index].match(TIMESTAMP_LINE);
    if (!timestampMatch) {
      id = lines[index].trim() || id;
      index += 1;
      timestampMatch = lines[index]?.match(TIMESTAMP_LINE) ?? null;
    }

    if (!timestampMatch) {
      throw new SubtitleParseError(`Could not read the timestamp near subtitle ${cues.length + 1}.`);
    }

    const start = parseTimestamp(timestampMatch[1]);
    const end = parseTimestamp(timestampMatch[2]);
    if (end <= start) {
      throw new SubtitleParseError(`Subtitle ${id} must end after it starts.`);
    }

    index += 1;
    const textLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== '') {
      textLines.push(lines[index]);
      index += 1;
    }

    if (textLines.length === 0) {
      throw new SubtitleParseError(`Subtitle ${id} has no text.`);
    }
    cues.push({ id, start, end, lines: textLines });
  }

  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function parseSrt(source: string): SubtitleCue[] {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues = parseCueLines(lines, 'srt');
  if (cues.length === 0) {
    throw new SubtitleParseError('No subtitles were found in this SRT file.');
  }
  return cues;
}

export function parseVtt(source: string): SubtitleCue[] {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  if (!lines[0]?.trim().startsWith('WEBVTT')) {
    throw new SubtitleParseError('This VTT file is missing its WEBVTT header.');
  }

  let startIndex = 1;
  while (startIndex < lines.length && lines[startIndex].trim() !== '') startIndex += 1;
  const cues = parseCueLines(lines, 'vtt', startIndex);
  if (cues.length === 0) {
    throw new SubtitleParseError('No subtitles were found in this VTT file.');
  }
  return cues;
}

export function subtitleFormatFromFilename(filename: string): SubtitleFormat | null {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension === 'srt' || extension === 'vtt' ? extension : null;
}

export function parseSubtitles(source: string, format: SubtitleFormat): SubtitleCue[] {
  return format === 'vtt' ? parseVtt(source) : parseSrt(source);
}

export async function readSubtitleFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  return new TextDecoder('utf-8').decode(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes);
}

export function activeCuesAt(cues: SubtitleCue[], time: number): SubtitleCue[] {
  return cues.filter((cue) => cue.start <= time && time < cue.end);
}

import type { SubtitleCue } from './types';

const TIMESTAMP_LINE = /^\s*((?:\d{1,3}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,3}:)?\d{1,2}:\d{2}[,.]\d{1,3})(?:\s+.*)?$/;

export class SrtParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SrtParseError';
  }
}

export function parseTimestamp(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length !== 3) throw new SrtParseError(`Invalid timestamp “${value}”.`);

  const [hours, minutes, seconds] = parts.map(Number);
  if (![hours, minutes, seconds].every(Number.isFinite) || minutes >= 60 || seconds >= 60) {
    throw new SrtParseError(`Invalid timestamp “${value}”.`);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

export function parseSrt(source: string): SubtitleCue[] {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues: SubtitleCue[] = [];
  let index = 0;

  while (index < lines.length) {
    while (index < lines.length && lines[index].trim() === '') index += 1;
    if (index >= lines.length) break;

    let id = String(cues.length + 1);
    let timestampMatch = lines[index].match(TIMESTAMP_LINE);
    if (!timestampMatch) {
      id = lines[index].trim() || id;
      index += 1;
      timestampMatch = lines[index]?.match(TIMESTAMP_LINE) ?? null;
    }

    if (!timestampMatch) {
      throw new SrtParseError(`Could not read the timestamp near subtitle ${cues.length + 1}.`);
    }

    const start = parseTimestamp(timestampMatch[1]);
    const end = parseTimestamp(timestampMatch[2]);
    if (end <= start) {
      throw new SrtParseError(`Subtitle ${id} must end after it starts.`);
    }

    index += 1;
    const textLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== '') {
      textLines.push(lines[index]);
      index += 1;
    }

    if (textLines.length === 0) {
      throw new SrtParseError(`Subtitle ${id} has no text.`);
    }
    cues.push({ id, start, end, lines: textLines });
  }

  if (cues.length === 0) {
    throw new SrtParseError('No subtitles were found in this SRT file.');
  }
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
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

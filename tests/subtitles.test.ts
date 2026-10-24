import { describe, expect, it } from 'vitest';
import { activeCuesAt, parseSrt, parseTimestamp, SrtParseError } from '../src/subtitles';

const SAMPLE = `\uFEFF1\r\n00:00:00,500 --> 00:00:02,000\r\nBienvenue à München\r\nDeuxième ligne\r\n\r\n2\r\n00:00:02.250 --> 00:00:04.000\r\nZażółć gęślą jaźń — 你好\r\n`;

describe('parseSrt', () => {
  it('preserves Unicode, explicit line breaks, and timestamps', () => {
    const cues = parseSrt(SAMPLE);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      id: '1',
      start: 0.5,
      end: 2,
      lines: ['Bienvenue à München', 'Deuxième ligne'],
    });
    expect(cues[1].lines[0]).toBe('Zażółć gęślą jaźń — 你好');
  });

  it('accepts an omitted numeric identifier', () => {
    expect(parseSrt('00:00:01,000 --> 00:00:02,000\nHello')[0].id).toBe('1');
  });

  it('rejects empty and backwards cues clearly', () => {
    expect(() => parseSrt('')).toThrow(SrtParseError);
    expect(() => parseSrt('1\n00:00:02,000 --> 00:00:01,000\nNope')).toThrow('must end after');
  });
});

describe('timestamp and cue lookup', () => {
  it('parses hours and milliseconds', () => expect(parseTimestamp('01:02:03,456')).toBe(3723.456));
  it('uses an exclusive cue end time', () => {
    const cues = parseSrt('1\n00:00:01,000 --> 00:00:02,000\nHello');
    expect(activeCuesAt(cues, 1)).toHaveLength(1);
    expect(activeCuesAt(cues, 2)).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { activeCuesAt, parseSrt, parseTimestamp, parseVtt, SrtParseError, subtitleFormatFromFilename } from '../src/subtitles';

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

describe('parseVtt', () => {
  it('supports headers, notes, cue identifiers, settings, and Unicode text', () => {
    const cues = parseVtt(`WEBVTT - translated captions
Language: de

NOTE translator note
This block is ignored.

intro
00:00.500 --> 00:02.000 align:center
<v Ann>Bienvenue à München

00:02.250 --> 00:04.000
Zażółć gęślą jaźń — 你好
`);

    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      id: 'intro',
      start: 0.5,
      end: 2,
      lines: ['<v Ann>Bienvenue à München'],
    });
    expect(cues[1].lines[0]).toBe('Zażółć gęślą jaźń — 你好');
  });

  it('requires the WEBVTT header', () => {
    expect(() => parseVtt('00:00.000 --> 00:01.000\nNo header')).toThrow('WEBVTT header');
  });

  it('recognises SRT and VTT file extensions without case sensitivity', () => {
    expect(subtitleFormatFromFilename('translated.SRT')).toBe('srt');
    expect(subtitleFormatFromFilename('translated.VTT')).toBe('vtt');
    expect(subtitleFormatFromFilename('translated.txt')).toBeNull();
  });
});

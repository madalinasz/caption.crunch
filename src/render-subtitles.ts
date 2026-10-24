import type { SubtitleCue, SubtitleStyle } from './types';

type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const SIZE_RATIOS = { small: 0.038, medium: 0.05, large: 0.064 } as const;

export function fontSizeFor(height: number, size: SubtitleStyle['size']): number {
  return Math.max(8, Math.round(height * SIZE_RATIOS[size]));
}

function plainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:i|b|u|font|span)(?:\s[^>]*)?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function splitLongToken(context: RenderContext, token: string, maxWidth: number): string[] {
  const parts: string[] = [];
  let part = '';
  for (const character of Array.from(token)) {
    const next = part + character;
    if (part && context.measureText(next).width > maxWidth) {
      parts.push(part);
      part = character;
    } else {
      part = next;
    }
  }
  if (part) parts.push(part);
  return parts;
}

export function wrapLine(context: RenderContext, input: string, maxWidth: number): string[] {
  const text = plainText(input);
  if (context.measureText(text).width <= maxWidth) return [text];

  const words = text.trim().split(/\s+/u);
  const output: string[] = [];
  let current = '';

  for (const word of words) {
    const pieces = context.measureText(word).width > maxWidth ? splitLongToken(context, word, maxWidth) : [word];
    for (const piece of pieces) {
      const candidate = current ? `${current} ${piece}` : piece;
      if (current && context.measureText(candidate).width > maxWidth) {
        output.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }
  }
  if (current) output.push(current);
  return output.length ? output : [''];
}

function roundedRect(context: RenderContext, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

export function renderSubtitles(
  context: RenderContext,
  width: number,
  height: number,
  cues: SubtitleCue[],
  style: SubtitleStyle,
): void {
  if (cues.length === 0 || width <= 0 || height <= 0) return;

  const fontSize = fontSizeFor(height, style.size);
  const lineHeight = Math.round(fontSize * 1.24);
  const maxWidth = width * 0.88;
  context.save();
  context.font = `700 ${fontSize}px "Segoe UI", Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';

  const lines = cues.flatMap((cue) => cue.lines.flatMap((line) => wrapLine(context, line, maxWidth)));
  if (lines.length === 0) {
    context.restore();
    return;
  }

  const widest = Math.max(...lines.map((line) => context.measureText(line).width));
  const paddingX = Math.round(fontSize * 0.42);
  const paddingY = Math.round(fontSize * 0.24);
  const blockHeight = lines.length * lineHeight;
  const bottom = height - height * (style.position / 100);
  const top = Math.max(height * 0.03, bottom - blockHeight);

  if (style.backing === 'panel') {
    const panelWidth = Math.min(width * 0.94, widest + paddingX * 2);
    context.fillStyle = 'rgba(0, 0, 0, 0.78)';
    roundedRect(context, (width - panelWidth) / 2, top - paddingY, panelWidth, blockHeight + paddingY * 2, fontSize * 0.18);
    context.fill();
  }

  context.fillStyle = style.colour;
  if (style.backing === 'outline') {
    context.strokeStyle = 'rgba(0, 0, 0, 0.98)';
    context.lineWidth = Math.max(2, fontSize * 0.14);
  }

  lines.forEach((line, lineIndex) => {
    const y = top + lineHeight * lineIndex + lineHeight / 2;
    if (style.backing === 'outline') context.strokeText(line, width / 2, y, maxWidth);
    context.fillText(line, width / 2, y, maxWidth);
  });
  context.restore();
}

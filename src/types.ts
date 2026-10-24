export type CaptionSize = 'small' | 'medium' | 'large';
export type CaptionBacking = 'outline' | 'panel' | 'none';

export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  lines: string[];
}

export interface SubtitleStyle {
  size: CaptionSize;
  colour: string;
  backing: CaptionBacking;
  position: number;
}

export interface EncodeRequest {
  type: 'encode';
  video: File;
  cues: SubtitleCue[];
  style: SubtitleStyle;
}

export type WorkerRequest = EncodeRequest | { type: 'cancel' };

export type WorkerResponse =
  | { type: 'stage'; stage: 'analysing' | 'encoding' | 'finalising'; detail: string }
  | { type: 'progress'; value: number; processedTime: number }
  | { type: 'complete'; buffer: ArrayBuffer; duration: number; width: number; height: number; hasAudio: boolean }
  | { type: 'cancelled' }
  | { type: 'error'; message: string; detail?: string };

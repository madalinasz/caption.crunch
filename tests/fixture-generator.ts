import { registerAacEncoder } from '@mediabunny/aac-encoder';
import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  canEncodeAudio,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSampleSink,
} from 'mediabunny';

interface MediaInspection {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  captionPixelCount: number;
  gapPixelCount: number;
  captionBoundsHeight: number;
}

async function generateFixture(): Promise<Uint8Array> {
  if (!(await canEncodeAudio('aac'))) registerAacEncoder();

  const width = 320;
  const height = 180;
  const duration = 3;
  const frameRate = 15;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not create fixture canvas.');

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target });
  const videoSource = new CanvasSource(canvas, { codec: 'avc', quality: new Quality('medium'), keyFrameInterval: 1 });
  const audioSource = new AudioBufferSource({ codec: 'aac', quality: new Quality('medium') });
  output.addVideoTrack(videoSource, { frameRate });
  output.addAudioTrack(audioSource);
  await output.start();

  const audioBuffer = new AudioBuffer({ numberOfChannels: 1, length: 48_000 * duration, sampleRate: 48_000 });
  const audio = audioBuffer.getChannelData(0);
  for (let index = 0; index < audio.length; index += 1) {
    audio[index] = Math.sin(2 * Math.PI * 440 * (index / 48_000)) * 0.12;
  }

  await Promise.all([
    (async () => {
      for (let frame = 0; frame < duration * frameRate; frame += 1) {
        const time = frame / frameRate;
        const gradient = context.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#173f35');
        gradient.addColorStop(1, '#356756');
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        context.fillStyle = '#f2c84b';
        context.fillRect(18 + time * 38, 52, 44, 44);
        context.fillStyle = '#b7cfbf';
        context.font = '700 13px Arial';
        context.fillText('CAPTION CRUNCH TEST', 18, 25);
        await videoSource.add(time, 1 / frameRate);
      }
      videoSource.close();
    })(),
    (async () => {
      await audioSource.add(audioBuffer);
      audioSource.close();
    })(),
  ]);

  await output.finalize();
  if (!target.buffer) throw new Error('Fixture encoder returned no data.');
  return new Uint8Array(target.buffer);
}

function whitePixelStats(data: Uint8ClampedArray, width: number, height: number): { count: number; boundsHeight: number } {
  let count = 0;
  let minY = height;
  let maxY = -1;
  for (let y = Math.floor(height * 0.5); y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset] > 205 && data[offset + 1] > 205 && data[offset + 2] > 205) {
        count += 1;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { count, boundsHeight: maxY >= minY ? maxY - minY + 1 : 0 };
}

async function pixelsAt(sink: VideoSampleSink, timestamp: number, width: number, height: number): Promise<{ count: number; boundsHeight: number }> {
  const sample = await sink.getSample(timestamp);
  if (!sample) return { count: 0, boundsHeight: 0 };
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not inspect output pixels.');
  sample.draw(context, 0, 0, width, height);
  sample.close();
  return whitePixelStats(context.getImageData(0, 0, width, height).data, width, height);
}

async function inspectMedia(bytes: number[]): Promise<MediaInspection> {
  const input = new Input({
    source: new BlobSource(new Blob([new Uint8Array(bytes)], { type: 'video/mp4' })),
    formats: ALL_FORMATS,
  });
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error('Output has no video track.');
  const width = await videoTrack.getDisplayWidth();
  const height = await videoTrack.getDisplayHeight();
  const sink = new VideoSampleSink(videoTrack);
  const caption = await pixelsAt(sink, 0.75, width, height);
  const gap = await pixelsAt(sink, 1.75, width, height);
  const result = {
    duration: await input.computeDuration(),
    width,
    height,
    hasAudio: Boolean(await input.getPrimaryAudioTrack()),
    captionPixelCount: caption.count,
    gapPixelCount: gap.count,
    captionBoundsHeight: caption.boundsHeight,
  };
  input.dispose();
  return result;
}

declare global {
  interface Window {
    testMedia: {
      generateFixture: typeof generateFixture;
      inspectMedia: typeof inspectMedia;
    };
  }
}

window.testMedia = { generateFixture, inspectMedia };

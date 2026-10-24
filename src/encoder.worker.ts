/// <reference lib="webworker" />

import { registerAacEncoder } from '@mediabunny/aac-encoder';
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  canEncodeAudio,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from 'mediabunny';
import { activeCuesAt } from './subtitles';
import { renderSubtitles } from './render-subtitles';
import type { EncodeRequest, WorkerRequest, WorkerResponse } from './types';

const worker = self as DedicatedWorkerGlobalScope;
let currentConversion: Conversion | null = null;

function send(message: WorkerResponse, transfer: Transferable[] = []): void {
  worker.postMessage(message, transfer);
}

function readableError(error: unknown): { message: string; detail?: string } {
  const detail = error instanceof Error ? error.message : String(error);
  if (/encoder|encoding.*not supported|no_encodable/i.test(detail)) {
    return {
      message: 'This device cannot create H.264 video at the source resolution.',
      detail: 'Try a smaller 1080p-or-lower MP4, update Microsoft Edge, and ensure hardware acceleration is enabled.',
    };
  }
  if (/decoder|decode|codec/i.test(detail)) {
    return {
      message: 'The video codec in this MP4 is not supported by this browser.',
      detail: 'Use an MP4 with H.264 video and AAC audio for the broadest compatibility.',
    };
  }
  if (/memory|allocation|ArrayBuffer/i.test(detail)) {
    return {
      message: 'The browser ran out of memory while creating the video.',
      detail: 'Close other tabs or use a shorter/lower-resolution source video.',
    };
  }
  return { message: 'The video could not be created.', detail };
}

async function encode(request: EncodeRequest): Promise<void> {
  let input: Input | null = null;
  try {
    send({ type: 'stage', stage: 'analysing', detail: 'Checking video and audio tracks' });

    input = new Input({ source: new BlobSource(request.video), formats: ALL_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('No video track was found in this MP4.');

    const width = await videoTrack.getDisplayWidth();
    const height = await videoTrack.getDisplayHeight();
    const duration = await input.computeDuration();
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!Number.isFinite(duration) || duration <= 0 || width <= 0 || height <= 0) {
      throw new Error('The MP4 has invalid or incomplete media metadata.');
    }

    if (audioTrack && !(await canEncodeAudio('aac'))) registerAacEncoder();

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) throw new Error('The browser could not create the video rendering canvas.');

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: false }),
      target,
    });

    currentConversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        codec: 'avc',
        quality: new Quality('high'),
        keyFrameInterval: 3,
        forceTranscode: true,
        allowTransformationMetadata: false,
        processedWidth: width,
        processedHeight: height,
        process: (sample) => {
          context.fillStyle = '#000000';
          context.fillRect(0, 0, width, height);
          sample.draw(context, 0, 0, width, height);
          const cueTime = Math.max(0, sample.timestamp + sample.duration / 2);
          renderSubtitles(context, width, height, activeCuesAt(request.cues, cueTime), request.style);
          return canvas;
        },
      },
      audio: audioTrack ? { codec: 'aac', quality: new Quality('high') } : { discard: true },
      copy: { mode: 'preferred' },
      showWarnings: false,
    });

    if (!currentConversion.isValid) {
      const reasons = currentConversion.discardedTracks.map(({ reason }) => reason).join(', ');
      throw new Error(`No compatible output tracks could be created${reasons ? ` (${reasons})` : ''}.`);
    }

    send({ type: 'stage', stage: 'encoding', detail: `Rendering captions into ${width} × ${height} video frames` });
    currentConversion.onProgress = (value, processedTime) => send({ type: 'progress', value, processedTime });
    await currentConversion.execute();

    send({ type: 'stage', stage: 'finalising', detail: 'Finishing the MP4 container' });
    if (!target.buffer) throw new Error('The MP4 encoder finished without an output file.');
    const buffer = target.buffer;
    send({ type: 'complete', buffer, duration, width, height, hasAudio: Boolean(audioTrack) }, [buffer]);
  } catch (error) {
    if (error instanceof ConversionCanceledError || currentConversion?.state === 'canceled') {
      send({ type: 'cancelled' });
    } else {
      send({ type: 'error', ...readableError(error) });
    }
  } finally {
    currentConversion = null;
    input?.dispose();
  }
}

worker.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === 'cancel') {
    void currentConversion?.cancel();
    return;
  }
  if (currentConversion) {
    send({ type: 'error', message: 'A video is already being created.' });
    return;
  }
  void encode(event.data);
});

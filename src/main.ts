import './styles.css';
import { outputFilename, fileStem } from './filename';
import { activeCuesAt, parseSrt, parseSubtitles, readSubtitleFile, subtitleFormatFromFilename, SubtitleParseError } from './subtitles';
import { renderSubtitles } from './render-subtitles';
import type { CaptionBacking, CaptionSize, SubtitleCue, SubtitleStyle, WorkerResponse } from './types';

const SOFT_FILE_LIMIT = 300 * 1024 * 1024;
const HARD_FILE_LIMIT = 1024 * 1024 * 1024;

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing interface element: ${selector}`);
  return found;
}

const videoInput = element<HTMLInputElement>('#video-input');
const srtInput = element<HTMLInputElement>('#srt-input');
const videoDrop = element<HTMLLabelElement>('#video-drop');
const srtDrop = element<HTMLLabelElement>('#srt-drop');
const videoSummary = element<HTMLElement>('#video-summary');
const srtSummary = element<HTMLElement>('#srt-summary');
const message = element<HTMLElement>('#message');
const memoryWarning = element<HTMLElement>('#memory-warning');
const video = element<HTMLVideoElement>('#video');
const canvas = element<HTMLCanvasElement>('#subtitle-canvas');
const emptyPreview = element<HTMLElement>('#empty-preview');
const videoMeta = element<HTMLElement>('#video-meta');
const colourInput = element<HTMLInputElement>('#text-colour');
const colourValue = element<HTMLOutputElement>('#colour-value');
const backingInput = element<HTMLSelectElement>('#backing');
const positionInput = element<HTMLInputElement>('#position');
const positionValue = element<HTMLOutputElement>('#position-value');
const suffixInput = element<HTMLInputElement>('#language-suffix');
const filenameExample = element<HTMLElement>('#filename-example');
const generateButton = element<HTMLButtonElement>('#generate');
const startOverButton = element<HTMLButtonElement>('#start-over');
const cancelButton = element<HTMLButtonElement>('#cancel');
const progressArea = element<HTMLElement>('#progress-area');
const progressLabel = element<HTMLElement>('#progress-label');
const progressPercent = element<HTMLElement>('#progress-percent');
const progressBar = element<HTMLProgressElement>('#progress');
const progressDetail = element<HTMLElement>('#progress-detail');
const downloadArea = element<HTMLElement>('#download-area');
const downloadLink = element<HTMLAnchorElement>('#download');
const outputSummary = element<HTMLElement>('#output-summary');

let videoFile: File | null = null;
let subtitleFile: File | null = null;
let cues: SubtitleCue[] = [];
let selectedSize: CaptionSize = 'medium';
let videoUrl: string | null = null;
let outputUrl: string | null = null;
let encoderWorker: Worker | null = null;
let encodingStartedAt = 0;

function currentStyle(): SubtitleStyle {
  return {
    size: selectedSize,
    colour: colourInput.value,
    backing: backingInput.value as CaptionBacking,
    position: Number(positionInput.value),
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

function showMessage(text: string, kind: 'error' | 'info' = 'error'): void {
  message.textContent = text;
  message.classList.toggle('info', kind === 'info');
  message.hidden = !text;
}

function clearMessage(): void {
  showMessage('');
}

function clearOutput(): void {
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
  downloadArea.hidden = true;
  downloadLink.removeAttribute('href');
}

function updateFilenameExample(): void {
  filenameExample.textContent = outputFilename(videoFile?.name ?? 'training.mp4', suffixInput.value || 'fr');
}

function updateReadyState(): void {
  const supported = 'VideoEncoder' in window && 'VideoDecoder' in window && 'OffscreenCanvas' in window && 'Worker' in window;
  generateButton.disabled = !(videoFile && cues.length && supported && !encoderWorker);
  if (!supported) {
    showMessage('Caption Crunch needs a current version of Microsoft Edge with WebCodecs enabled.');
  }
  updateFilenameExample();
}

function drawPreview(): void {
  if (!videoFile || canvas.width === 0 || canvas.height === 0) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  renderSubtitles(context, canvas.width, canvas.height, activeCuesAt(cues, video.currentTime), currentStyle());
}

function schedulePreviewFrame(): void {
  drawPreview();
  if (video.paused || video.ended) return;
  if ('requestVideoFrameCallback' in video) {
    video.requestVideoFrameCallback(() => schedulePreviewFrame());
  } else {
    requestAnimationFrame(schedulePreviewFrame);
  }
}

function revealFirstCue(): void {
  if (!videoFile || cues.length === 0 || video.readyState < HTMLMediaElement.HAVE_METADATA) {
    drawPreview();
    return;
  }

  if (activeCuesAt(cues, video.currentTime).length === 0) {
    const firstCue = cues.find((cue) => cue.start < video.duration);
    if (firstCue) {
      video.currentTime = Math.max(firstCue.start, Math.min(firstCue.start + 0.05, firstCue.end - 0.001));
    }
  }
  drawPreview();
}

function waitForMetadata(): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('Microsoft Edge could not read this MP4.')), { once: true });
  });
}

async function selectVideo(file: File): Promise<void> {
  clearMessage();
  clearOutput();
  if (!file.name.toLowerCase().endsWith('.mp4') && file.type !== 'video/mp4') {
    showMessage('Choose an MP4 video file.');
    return;
  }
  if (file.size > HARD_FILE_LIMIT) {
    showMessage('This MP4 is over 1 GB. Use a shorter or more compressed file to avoid exhausting browser memory.');
    return;
  }

  videoFile = file;
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;
  video.load();
  videoDrop.classList.add('has-file');
  videoSummary.textContent = `${file.name} · ${formatBytes(file.size)}`;
  emptyPreview.hidden = true;
  memoryWarning.hidden = file.size <= SOFT_FILE_LIMIT;
  if (file.size > SOFT_FILE_LIMIT) {
    memoryWarning.textContent = 'Large file: export may use substantial memory and take longer than the video duration. Close other tabs before encoding.';
  }

  try {
    await waitForMetadata();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    videoMeta.textContent = `${video.videoWidth} × ${video.videoHeight} · ${formatTime(video.duration)} · ${formatBytes(file.size)}`;
    revealFirstCue();
  } catch (error) {
    videoFile = null;
    showMessage(error instanceof Error ? error.message : 'This MP4 could not be opened.');
  }
  updateReadyState();
}

async function selectSubtitles(file: File): Promise<void> {
  clearMessage();
  clearOutput();
  const format = subtitleFormatFromFilename(file.name);
  if (!format) {
    showMessage('Choose an SRT or VTT subtitle file.');
    return;
  }

  try {
    const parsed = parseSubtitles(await readSubtitleFile(file), format);
    subtitleFile = file;
    cues = parsed;
    srtDrop.classList.add('has-file');
    srtSummary.textContent = `${file.name} · ${parsed.length} subtitle${parsed.length === 1 ? '' : 's'}`;
    revealFirstCue();
  } catch (error) {
    subtitleFile = null;
    cues = [];
    const text = error instanceof SubtitleParseError ? error.message : 'This subtitle file could not be read.';
    showMessage(text);
  }
  updateReadyState();
}

function addDropSupport(zone: HTMLElement, accept: (file: File) => void): void {
  for (const eventName of ['dragenter', 'dragover']) {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add('dragging');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove('dragging');
    });
  }
  zone.addEventListener('drop', (event) => {
    const dropped = (event as DragEvent).dataTransfer?.files[0];
    if (dropped) accept(dropped);
  });
}

function setProgress(value: number, detail?: string): void {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  progressBar.value = percent;
  progressBar.textContent = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  if (detail) progressDetail.textContent = detail;
}

function finishEncoding(): void {
  encoderWorker?.terminate();
  encoderWorker = null;
  generateButton.classList.remove('working');
  generateButton.innerHTML = '<span aria-hidden="true">✦</span> Generate video';
  updateReadyState();
}

function onWorkerMessage(response: WorkerResponse): void {
  if (response.type === 'stage') {
    const labels = { analysing: 'Preparing video…', encoding: 'Burning in subtitles…', finalising: 'Finalising MP4…' };
    progressLabel.textContent = labels[response.stage];
    progressDetail.textContent = response.detail;
    if (response.stage === 'finalising') setProgress(0.99);
    return;
  }
  if (response.type === 'progress') {
    setProgress(response.value, `${formatTime(response.processedTime)} of ${formatTime(video.duration)} processed`);
    return;
  }
  if (response.type === 'cancelled') {
    progressArea.hidden = true;
    showMessage('Video creation was cancelled.', 'info');
    finishEncoding();
    return;
  }
  if (response.type === 'error') {
    progressArea.hidden = true;
    showMessage(`${response.message}${response.detail ? ` ${response.detail}` : ''}`);
    finishEncoding();
    return;
  }

  setProgress(1);
  const blob = new Blob([response.buffer], { type: 'video/mp4' });
  outputUrl = URL.createObjectURL(blob);
  const filename = outputFilename(videoFile?.name ?? 'video.mp4', suffixInput.value);
  downloadLink.href = outputUrl;
  downloadLink.download = filename;
  const elapsed = Math.round((performance.now() - encodingStartedAt) / 1000);
  outputSummary.textContent = `${filename} · ${formatBytes(blob.size)} · ${response.width} × ${response.height}${response.hasAudio ? ' · audio retained' : ' · source had no audio'} · ${elapsed}s`;
  progressArea.hidden = true;
  downloadArea.hidden = false;
  finishEncoding();
  downloadArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function generateVideo(): void {
  if (!videoFile || !subtitleFile || cues.length === 0 || encoderWorker) return;
  clearMessage();
  clearOutput();
  progressArea.hidden = false;
  progressLabel.textContent = 'Preparing video…';
  setProgress(0, 'Starting the local encoder');
  generateButton.disabled = true;
  generateButton.classList.add('working');
  generateButton.textContent = 'Encoding…';
  encodingStartedAt = performance.now();

  encoderWorker = new Worker(new URL('./encoder.worker.ts', import.meta.url), { type: 'module' });
  encoderWorker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => onWorkerMessage(event.data));
  encoderWorker.addEventListener('error', (event) => {
    progressArea.hidden = true;
    showMessage(`The local encoder stopped unexpectedly. ${event.message}`);
    finishEncoding();
  });
  encoderWorker.postMessage({ type: 'encode', video: videoFile, cues, style: currentStyle() });
}

function reset(): void {
  if (encoderWorker) {
    encoderWorker.terminate();
    encoderWorker = null;
  }
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = null;
  video.removeAttribute('src');
  video.load();
  videoFile = null;
  subtitleFile = null;
  cues = [];
  videoInput.value = '';
  srtInput.value = '';
  videoDrop.classList.remove('has-file');
  srtDrop.classList.remove('has-file');
  videoSummary.textContent = 'MP4 video';
  srtSummary.textContent = 'SRT or VTT subtitles';
  videoMeta.textContent = 'Waiting for an MP4';
  emptyPreview.hidden = false;
  memoryWarning.hidden = true;
  progressArea.hidden = true;
  selectedSize = 'medium';
  document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((button) => {
    const selected = button.dataset.size === 'medium';
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', String(selected));
  });
  colourInput.value = '#ffffff';
  colourValue.value = '#FFFFFF';
  backingInput.value = 'outline';
  positionInput.value = '8';
  positionValue.value = '8% from bottom';
  suffixInput.value = '';
  clearMessage();
  clearOutput();
  finishEncoding();
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

videoInput.addEventListener('change', () => {
  const file = videoInput.files?.[0];
  if (file) void selectVideo(file);
});
srtInput.addEventListener('change', () => {
  const file = srtInput.files?.[0];
  if (file) void selectSubtitles(file);
});
addDropSupport(videoDrop, (file) => void selectVideo(file));
addDropSupport(srtDrop, (file) => void selectSubtitles(file));

document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((button) => {
  button.addEventListener('click', () => {
    selectedSize = button.dataset.size as CaptionSize;
    document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((candidate) => {
      const selected = candidate === button;
      candidate.classList.toggle('selected', selected);
      candidate.setAttribute('aria-checked', String(selected));
    });
    clearOutput();
    drawPreview();
  });
});

colourInput.addEventListener('input', () => {
  colourValue.value = colourInput.value.toUpperCase();
  clearOutput();
  drawPreview();
});
backingInput.addEventListener('change', () => { clearOutput(); drawPreview(); });
positionInput.addEventListener('input', () => {
  positionValue.value = `${positionInput.value}% from bottom`;
  clearOutput();
  drawPreview();
});
suffixInput.addEventListener('input', updateFilenameExample);
video.addEventListener('play', schedulePreviewFrame);
video.addEventListener('timeupdate', drawPreview);
video.addEventListener('seeked', drawPreview);
video.addEventListener('loadeddata', revealFirstCue);
generateButton.addEventListener('click', generateVideo);
startOverButton.addEventListener('click', reset);
cancelButton.addEventListener('click', () => {
  cancelButton.disabled = true;
  progressDetail.textContent = 'Stopping after the current frame…';
  encoderWorker?.postMessage({ type: 'cancel' });
});
downloadLink.addEventListener('click', () => showMessage('Download started. You can start over when you are ready for another video.', 'info'));

updateReadyState();
updateFilenameExample();

// Exposed only for deterministic browser tests; no user data leaves the page.
if (import.meta.env.DEV) {
  Object.assign(window, { __captionCrunch: { parseSrt, parseSubtitles, fileStem, currentStyle } });
}

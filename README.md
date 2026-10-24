# Caption Crunch

Caption Crunch is a private, browser-based tool for burning translated SRT subtitles into MP4 training videos. It creates a genuine H.264 MP4 in Microsoft Edge, keeps the source audio and timing, and never uploads the video, filename, or subtitles.

## What it does

- Accepts one MP4 and one SRT file at a time.
- Parses UTF-8, UTF-16 LE, and UTF-16 BE subtitle files, preserving timestamps, Unicode text, and explicit line breaks.
- Shows captions over the browser's seekable video preview.
- Offers three proportional caption sizes, text colour, black outline/dark panel/no backing, and vertical position.
- Decodes frames with WebCodecs, renders captions with the Canvas API in a worker, re-encodes H.264, and muxes a real MP4.
- Copies compatible source audio packets. If copying is not possible, it re-encodes audio to AAC locally with the bundled fallback encoder.
- Reports progress, supports cancellation, names the download from the source filename and language suffix, and resets without a page reload.

There is no backend, API key, account, analytics, telemetry, CDN, or runtime network dependency.

## Use the production build

The ready-to-deploy static site is in `dist/`. Serve that directory over HTTPS using any internal static web host. WebCodecs is a secure-context browser API; opening `index.html` directly with a `file://` URL is not supported.

Recommended end-user environment:

- Current 64-bit Microsoft Edge on Windows 10/11.
- Hardware acceleration enabled in Edge.
- H.264/AAC source MP4 for the broadest input compatibility.
- At least several GB of free memory for longer 1080p videos.

## Build locally

Prerequisites: Node.js 22 or newer and pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm build
```

The command creates a complete static build in `dist/`. All required JavaScript and the AAC WebAssembly fallback are included in the generated assets.

For local development:

```bash
pnpm dev
```

Then open the URL printed by Vite in Microsoft Edge.

## Deploy on Vercel

The included `vercel.json` configures Vercel for this Vite static build.

1. Import this GitHub repository into Vercel.
2. Keep the detected framework as **Vite**.
3. Build command: `pnpm build`.
4. Output directory: `dist`.
5. Deploy. No environment variables or server functions are required.

Vercel serves the site over HTTPS, which is required for WebCodecs outside localhost.

## Deploy on an internal static host

Run the build once in CI and publish the contents of `dist/` to an HTTPS-enabled static website (for example Azure Static Web Apps, an internal IIS site, SharePoint static hosting where allowed, or an internal object-storage website behind HTTPS). Do not add a proxy or upload endpoint: Caption Crunch reads files only through the user's browser file picker.

The host must serve `.js` as JavaScript. No special cross-origin isolation headers are required.

## Technical approach

FFmpeg.wasm's common prebuilt cores do not reliably include the `subtitles`/libass filter and are expensive to load. Caption Crunch instead uses:

1. `mediabunny` to demux the source MP4.
2. WebCodecs to decode source frames.
3. A dedicated worker and `OffscreenCanvas` to draw each frame and its active SRT cue with the same shared renderer used by the preview.
4. WebCodecs to encode H.264.
5. `mediabunny` to mux H.264 plus retained AAC into a valid MP4 container.
6. `@mediabunny/aac-encoder`, whose encoder and WebAssembly are embedded in the local bundle, only when native AAC encoding is unavailable and audio cannot be copied.

The video is necessarily re-encoded because captions change its pixels. Audio is packet-copied whenever the source codec and timestamps permit it; otherwise it is decoded and re-encoded while retaining the media timeline.

## Practical limits

- The application warns above 300 MB and blocks source files above 1 GB. The final MP4 is assembled in browser memory, so the safe ceiling depends on the laptop's RAM, GPU, Edge version, resolution, duration, and bitrate.
- As a practical starting point, use H.264/AAC video at 1080p or below and test your organisation's typical 15–30 minute content on its standard laptop image. 4K and hour-long high-bitrate files may exhaust memory.
- Encoding can take near real time or longer. Hardware, power mode, other tabs, source codec, frame rate, and resolution all matter.
- H.264 hardware encoding must be available through Edge. The app checks browser features and reports codec/encoder failures rather than producing a renamed WebM.
- MP4 codecs that Edge cannot decode (some HEVC configurations, for example) cannot be processed. H.264 video with AAC audio is the safest interchange format.
- Output MP4 metadata is written at the end of the completed file to reduce peak encoding memory. This is a valid downloadable/uploadable MP4; it is not intended for progressive playback before download finishes.
- SRT style tags are simplified to plain text. Explicit text line breaks are retained and overlong lines are wrapped to the safe title area.
- System fonts are used so a language's glyphs must be installed on the Windows laptop. Missing glyphs render as the browser's normal fallback/tofu characters.
- Closing/reloading the tab or putting the laptop to sleep interrupts an active export.

## Tests

```bash
pnpm test
pnpm test:e2e
pnpm check
```

The unit suite covers timestamp parsing, Unicode and line-break preservation, cue boundaries, filename sanitisation, line wrapping, and proportional size maths. The Edge end-to-end suite generates a real H.264/AAC fixture, exports Small, Medium, and Large variants, demuxes and decodes the results, confirms audio and duration, detects permanent caption pixels after seeking, and compares exported caption bounds with the preview.

Fixtures are in `tests/fixtures/`, including accented European characters and CJK text. See `docs/TEST-REPORT.md` for the latest recorded run.

## Privacy and security

- User-selected files remain in browser memory or browser-managed local blob URLs.
- The application contains no `fetch`/XHR calls to external services, upload forms, telemetry SDKs, cookies, or local-storage tracking.
- The only download is the MP4 the user explicitly creates.
- The production build is deterministic from the pinned `pnpm-lock.yaml`.

## Project layout

```text
src/
  encoder.worker.ts       Worker-based decode, render, encode, and mux pipeline
  render-subtitles.ts     Shared preview/export caption renderer
  subtitles.ts            SRT decoder, parser, and cue lookup
  main.ts                 UI state, validation, preview, progress, and download
tests/
  fixtures/               Small H.264/AAC MP4 and Unicode SRT
  e2e/                    Edge UI and genuine-media export tests
dist/                     Ready-to-deploy static build
```

## Licence

Caption Crunch is MIT licensed. Mediabunny and its AAC encoder extension are MPL-2.0 licensed; see `THIRD_PARTY_NOTICES.md`.

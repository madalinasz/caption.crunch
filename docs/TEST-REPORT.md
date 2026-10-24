# Caption Crunch test report

Run date: 23 October 2026  
Browser: Microsoft Edge (Playwright `msedge` channel) on Windows  
Build: production Vite build from this repository

## Automated results

- Unit tests: **9 passed**.
- Edge end-to-end tests: **3 passed**.
- Production TypeScript/Vite build: **passed**.
- Runtime external dependency scan: **passed**; production assets are local and self-contained.

## Media workflow verified

The test fixture is a genuine 320 × 180, 15 fps, three-second H.264 MP4 with a 48 kHz AAC sine-wave audio track. Its SRT includes `Bienvenue à München`, `Deuxième ligne — déjà vu`, `Zażółć gęślą jaźń`, and `你好`.

The Edge test performed the complete user workflow and verified:

- MP4 selection and metadata loading.
- Unicode SRT parsing with two explicit lines in the first cue.
- Small, Medium, and Large preview states are mutually exclusive.
- Three genuine MP4 exports, one per caption size.
- Output files demux and decode successfully as 320 × 180 MP4 video.
- Output duration remains approximately three seconds.
- The output retains an audio track.
- Caption-coloured pixels are present during cue time and absent during a subtitle gap, demonstrating burned-in pixels rather than a selectable subtitle track.
- Seeking to a cue time returns a decoded frame containing the caption.
- Exported caption bounds match preview bounds within three pixels at fixture resolution.
- Exported caption bounds increase in order: Small < Medium < Large.
- Output naming follows `source-with-audio_de.mp4`.
- Reset and invalid-SRT error handling work without reloading the page.

The generated source fixture is committed at `tests/fixtures/source-with-audio.mp4`. Test output files remain ignored by Git.

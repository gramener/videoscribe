# Video Scribe

Video Scribe is a web application that processes video files, extracting audio, transcribing speech, and capturing key frames. It provides a visual interface for analyzing video content and generating markdown-based transcripts with embedded images.

## Features

- Video upload and processing
- Audio extraction and transcription
- Key frame extraction
- Interactive transcript editing
- Markdown export with embedded images
- Dark mode support

## Prerequisites

- Node.js (v14 or later)
- FFmpeg

## Usage

No installation required. Start the server via:

```bash
npx videoscribe
```

or:

```bash
deno run --allow-read --allow-write --allow-net --allow-env --allow-run https://raw.githubusercontent.com/gramener/videoscribe/refs/heads/main/cli.js
```

Log into [LLM Foundry](https://llmfoundry.straive.com/).

Then open your browser and navigate to `http://localhost:3000` and upload a video file.

This will transcribe the audio and extract key frames from the video. You can then:

1. View and edit the transcript
2. Play the extracted audio
3. Toggle key frames on/off
4. Export the result as a ZIP file with the keyframes, Markdown transcript and JSON transcript

## API Endpoints

- `POST /audio`: Extract audio from uploaded video
- `POST /keyframes`: Extract key frames from uploaded video

Both endpoints accept multipart form data with a `file` field containing the video file.

## Technologies Used

- Backend: Node.js, Express.js
- Frontend: HTML, CSS, JavaScript (ES6+)
- UI Framework: Bootstrap 5
- Templating: lit-html
- Audio Processing: FFmpeg
- Transcription: Groq API (distil-whisper-large-v3-en model)

## License

This project is licensed under the MIT License.

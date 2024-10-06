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

## Installation

Clone the repository and install dependencies:

```bash
bash
git clone https://github.com/gramener/videoscribe.git
cd videoscribe
npm install
```

## Usage

1. Start the server:

```bash
npm start
```

2. Open your browser and navigate to `http://localhost:3000`.
3. Upload a video file and interact with the interface to process the video.
4. Wait for the processing to complete. You'll see progress updates in the UI.
5. Once processing is done, you can:
   - View and edit the transcript
   - Play the extracted audio
   - Toggle key frames on/off
   - Export the result as a markdown file

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

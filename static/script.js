import { SSE } from "https://cdn.jsdelivr.net/npm/sse.js@2";

const $step = document.getElementById("step");
const $log = document.getElementById("log");
const $keyframes = document.getElementById("keyframes");
const $fileInput = document.getElementById("file");
const $audioOutput = document.getElementById("audio-output");

$fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  // Extract audio
  $step.textContent = "Extracting audio...";
  const { code, output } = await audio(formData);
  if (code == 0) {
    $step.textContent = "Transcribing audio...";
    const transcript = await transcribe(output);
    $audioOutput.src = output;
  }

  // Extract keyframes
  $step.textContent = "Extracting keyframes...";
  $keyframes.innerHTML = "";
  for await (const match of keyframes(formData)) {
    const [n, pts_time] = match.slice(1);
    const filename = `uploads/${file.name}/keyframe-${(parseInt(n) + 1).toString().padStart(4, "0")}.jpg`;
    $keyframes.insertAdjacentHTML("beforeend", `<div class="col"><img src="${filename}" class="img-fluid my-3"></div>`);
  }

  $step.classList.add("d-none");
  $log.classList.add("d-none");
});

function log(message) {
  $log.classList.remove("d-none");
  $log.insertAdjacentHTML("beforeend", `<div>${message}</div>`);
  $log.scrollTop = $log.scrollHeight;
}

function audio(formData) {
  return new Promise((resolve, reject) => {
    const source = new SSE("audio", { payload: formData, start: false });
    source.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      const message = data.stdout || data.stderr;
      if (message) log(message);
      if (data.output) resolve(data);
    });
    source.stream();
  });
}

async function* keyframes(formData) {
  const source = new SSE("keyframes", { payload: formData, start: false });
  let resolve;
  let next = new Promise((r) => (resolve = r));
  const buffer = [];
  source.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    const message = data.stdout || data.stderr;
    if (message) {
      const match = message.match(/n: *(\d+)\s*pts: *\d+\s*pts_time:(\d+\.?\d*)/);
      if (match) resolve(buffer.push(match));
    }
    if (data.output) resolve(false);
  });
  source.stream(); // Start streaming
  while (true) {
    const pending = await next;
    while (buffer.length) yield buffer.shift();
    if (!pending) break;
    next = new Promise((r) => (resolve = r));
  }
}

async function transcribe(audioURL) {
  const url = "https://llmfoundry.straive.com/groq/openai/v1/audio/transcriptions";
  const formData = new FormData();
  formData.append("response_format", "verbose_json");
  formData.append("model", "distil-whisper-large-v3-en");
  formData.append("language", "en");
  formData.append("file", await fetch(audioURL).then((r) => r.blob()), "audio.wav");
  return fetch(url, { method: "POST", credentials: "include", body: formData }).then((r) => r.json());
}

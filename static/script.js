import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { SSE } from "https://cdn.jsdelivr.net/npm/sse.js@2";
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3/+esm";

const $videoForm = document.getElementById("video-form");
const $alert = document.getElementById("alert");
const $step = document.getElementById("step");
const $log = document.getElementById("log");
const $result = document.getElementById("result");
const $controls = document.getElementById("controls");
const $audioOutput = document.getElementById("audio-output");
const info = {};

$videoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  $alert.classList.add("d-none");

  const formData = new FormData($videoForm);
  const file = formData.get("file");
  info.keyframes = [];

  try {
    // Extract audio
    $step.textContent = "Extracting audio...";
    const { code, output } = await audio(formData);
    if (code == 0) {
      $step.textContent = "Transcribing audio...";
      info.audio = $audioOutput.src = output;
      // Get the transcript from the server if it exists. Else transcribe the audio.
      try {
        info.transcript = await fetch(`uploads/${file.name}/transcript.json`).then((r) => r.json());
      } catch (e) {
        info.transcript = await transcribe(output);
      }
      draw();
      $controls.classList.remove("d-none");
    }

    // Extract keyframes
    $step.textContent = "Extracting keyframes...";
    for await (const match of keyframes(formData)) {
      const [n, start] = match.slice(1);
      const filename = `uploads/${file.name}/${(parseInt(n) + 1).toString().padStart(4, "0")}.jpg`;
      info.keyframes.push({ filename, start: parseFloat(start) });
      draw();
    }

    // Done
    $step.classList.add("d-none");
    $log.classList.add("d-none");
  } catch (error) {
    $alert.classList.remove("d-none");
    $alert.querySelector("pre").textContent = error.message;
  }
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
    if (data.output) resolve(buffer.push(null));
  });
  source.stream(); // Start streaming
  while (true) {
    await next;
    next = new Promise((r) => (resolve = r));
    while (buffer.length) {
      const match = buffer.shift();
      if (match === null) return;
      yield match;
    }
  }
}

async function transcribe(audioURL) {
  const url = "https://llmfoundry.straive.com/groq/openai/v1/audio/transcriptions";
  const formData = new FormData();
  formData.append("response_format", "verbose_json");
  formData.append("model", "whisper-large-v3");
  formData.append("language", "en");
  formData.append("file", await fetch(audioURL).then((r) => r.blob()), "audio.opus");
  return fetch(url, { method: "POST", credentials: "include", body: formData }).then((r) => r.json());
}

const renderKeyframe = ({ index, start, filename, caption }) => html`
  <div class="keyframe mb-3 me-3 position-relative" data-index="${index}">
    <figure class="figure m-0">
      <img
        title="${start}"
        src="${filename}"
        alt="${caption || `Keyframe at ${start}s`}"
        class="img-fluid m-1 mw-50 figure-img"
      />
      <figcaption class="figure-caption text-center">${caption || ""}</figcaption>
    </figure>
    <button class="btn btn-sm btn-success position-absolute top-0 end-0 m-2 generate-caption">
      <i class="bi bi-magic"></i>
    </button>
  </div>
`;

const renderSegment = ({ index, start, end, text }) =>
  html`<p class="segment" data-index="${index}" contenteditable title="${start}-${end}">${text.trim()}</p>`;

function draw() {
  info.parts = [
    ...info.keyframes.map((d, i) => ({ type: "keyframe", index: i, ...d })),
    ...info.transcript.segments.map((d, i) => ({ type: "segment", index: i, ...d })),
  ];
  // Sort parts by time, then type
  info.parts.sort((a, b) => a.start - b.start || a.type.localeCompare(b.type));
  render(
    info.parts.map((d) => (d.type === "keyframe" ? renderKeyframe : renderSegment)(d)),
    $result,
  );
}

$result.addEventListener("click", async (event) => {
  const $generate = event.target.closest(".generate-caption");
  if ($generate) {
    // Get the [data-index] from the sibling img
    const index = +$generate.closest(".keyframe").dataset.index;
    info.keyframes[index].caption = "Generating...";
    draw();
    const imageDataUrl = await getImageData($generate.closest(".keyframe").querySelector("img"));
    const [, imageType, imageData] = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    const response = await fetch("https://llmfoundry.straive.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Describe this SAFE image for a blind person. List all objects. Avoid introductory phrases like 'The image...'",
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/${imageType};base64,${imageData}`, detail: "low" } },
            ],
          },
        ],
      }),
    }).then((r) => r.json());
    info.keyframes[index].caption = response.choices[0].message.content;
    draw();
  }

  if (event.target.tagName === "IMG") {
    event.target.closest(".keyframe").classList.toggle("ignore");
    draw();
  } else if (event.target.tagName === "P") {
    const start = parseFloat(event.target.dataset.start);
    const end = parseFloat(event.target.dataset.end);
    const currentTime = $audioOutput.currentTime;
    if (currentTime < start || currentTime > end || $audioOutput.paused) $audioOutput.currentTime = start;
    $audioOutput.play();
  }
});

document.querySelector("#export").addEventListener("click", async (event) => {
  // Add a spinner to the export button
  event.target.innerHTML = 'Exporting <div class="spinner-border"></div>';
  const elements = $result.querySelectorAll(".keyframe, .segment");
  const parts = info.parts
    .map(({ type, filename, text, start, end }, i) => [
      { type, ...(type == "keyframe" ? { filename, start } : { text, start, end }) },
      elements[i].matches(".ignore"),
    ])
    .filter(([, ignore]) => !ignore)
    .map(([d]) => d);
  parts.forEach((d) => {
    if (d.type == "keyframe") d.filename = d.filename.split("/").pop();
  });
  const zip = new JSZip();
  const markdown = parts
    .map((d) => {
      if (d.type == "segment") return d.text + "\n\n";
      if (d.type == "keyframe") return `![${(d.caption || "").replace(/\]/g, "\\")}](${d.filename})\n\n`;
    })
    .join("");
  zip.file("transcript.md", new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  zip.file("transcript.json", new Blob([JSON.stringify(parts, null, 2)], { type: "application/json;charset=utf-8" }));
  for (const img of $result.querySelectorAll(".keyframe:not(.ignore) img"))
    zip.file(img.src.split("/").pop(), await getImageData(img, "blob"));
  const blob = await zip.generateAsync({ type: "blob" });
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `transcript.zip`,
  });
  link.click();
  URL.revokeObjectURL(link.href);
  // Remove the spinner
  event.target.innerHTML = "Export";
});

const getImageData = async (img, format = "base64") => {
  const canvas = Object.assign(document.createElement("canvas"), {
    width: img.naturalWidth,
    height: img.naturalHeight,
  });
  canvas.getContext("2d").drawImage(img, 0, 0);
  return format == "base64"
    ? canvas.toDataURL("image/jpeg")
    : new Promise((resolve) => canvas.toBlob((blob) => resolve(blob)));
};

// Retry loading images that error out
const retryOnError = (img) => img?.addEventListener("error", () => setTimeout(() => (img.src = img.src), 1000));
new MutationObserver((mutations) =>
  mutations.forEach((m) => m.addedNodes.forEach((node) => retryOnError(node.querySelector?.("img")))),
).observe($result, { childList: true, subtree: true });

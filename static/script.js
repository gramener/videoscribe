import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { SSE } from "https://cdn.jsdelivr.net/npm/sse.js@2";

const $alert = document.getElementById("alert");
const $step = document.getElementById("step");
const $log = document.getElementById("log");
const $result = document.getElementById("result");
const $fileInput = document.getElementById("file");
const $controls = document.getElementById("controls");
const $audioOutput = document.getElementById("audio-output");
const $export = document.getElementById("export");
const info = {};

$fileInput.addEventListener("change", async (event) => {
  $alert.classList.add("d-none");

  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  info.keyframes = [];

  try {
    // Extract audio
    $step.textContent = "Extracting audio...";
    const { code, output } = await audio(formData);
    if (code == 0) {
      $step.textContent = "Transcribing audio...";
      info.audio = $audioOutput.src = output;
      info.transcript = await transcribe(output);
      draw();
      $controls.classList.remove("d-none");
    }

    // Extract keyframes
    $step.textContent = "Extracting keyframes...";
    for await (const match of keyframes(formData)) {
      const [n, time] = match.slice(1);
      const filename = `uploads/${file.name}/keyframe-${(parseInt(n) + 1).toString().padStart(4, "0")}.jpg`;
      info.keyframes.push({ filename, time: parseFloat(time) });
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
  formData.append("model", "distil-whisper-large-v3-en");
  formData.append("language", "en");
  formData.append("file", await fetch(audioURL).then((r) => r.blob()), "audio.wav");
  return fetch(url, { method: "POST", credentials: "include", body: formData }).then((r) => r.json());
}

function draw() {
  const renderKeyframe = (keyframe, index) => html`
    <div class="img-box mb-3 me-3 position-relative" data-index="${index}">
      <figure class="figure m-0">
        <img
          src="${keyframe.filename}"
          alt="${keyframe.caption || `Keyframe at ${keyframe.time}s`}"
          class="img-fluid m-1 mw-50 figure-img"
        />
        <figcaption class="figure-caption text-center">${keyframe.caption || ""}</figcaption>
      </figure>
      <button class="btn btn-sm btn-success position-absolute top-0 end-0 m-2 generate-caption">
        <i class="bi bi-magic"></i>
      </button>
    </div>
  `;
  let index = 0;
  const content = info.transcript.segments.map((segment) => {
    const newIndex = info.keyframes.findIndex((kf) => kf.time > segment.end);
    const frames = info.keyframes.slice(index, newIndex);
    index = newIndex;
    return html`
      <div class="mb-3">
        <div class="d-flex flex-wrap">${frames.map(renderKeyframe)}</div>
        <p contenteditable data-start="${segment.start}" data-end="${segment.end}">${segment.text}</p>
      </div>
    `;
  });
  const suffix = html`
    <div class="mb-3">
      <div class="d-flex flex-wrap">
        ${info.keyframes.slice(index).map((kf, i) => renderKeyframe(kf, i + info.keyframes.length))}
      </div>
    </div>
  `;
  render(html`${content}${suffix}`, $result);
}

$result.addEventListener("click", async (event) => {
  const $generate = event.target.closest(".generate-caption");
  if ($generate) {
    // Get the [data-index] from the sibling img
    const index = +$generate.closest(".img-box").dataset.index;
    info.keyframes[index].caption = "Generating...";
    draw();
    const imageDataUrl = getBase64FromImg($generate.closest(".img-box").querySelector("img"));
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
    event.target.closest(".img-box").classList.toggle("ignore");
    draw();
  } else if (event.target.tagName === "P") {
    const start = parseFloat(event.target.dataset.start);
    const end = parseFloat(event.target.dataset.end);
    const currentTime = $audioOutput.currentTime;
    if (currentTime < start || currentTime > end || $audioOutput.paused) $audioOutput.currentTime = start;
    $audioOutput.play();
  }
});

$controls.addEventListener("click", (event) => {
  const $export = event.target.closest(".export");
  if (!$export) return;
  // Add a spinner to the export button
  const originalText = $export.textContent;
  $export.innerHTML = 'Exporting <div class="spinner-border"></div>';
  $export.disabled = true;
  let blob;
  if ($export.dataset.format === "md") {
    const markdown = Array.from($result.querySelectorAll("p[contenteditable], img:not(.ignore)"))
      .map((el) => {
        if (el.tagName === "P") return el.textContent.trim() + "\n\n";
        if (el.tagName === "IMG") return `![${el.alt.replace(/\]/g, "\\]")}](${getBase64FromImg(el)})\n\n`;
      })
      .join("");
    blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  } else if ($export.dataset.format === "json") {
    const json = JSON.stringify(info, null, 2);
    blob = new Blob([json], { type: "application/json;charset=utf-8" });
  }
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `transcript.${$export.dataset.format}`,
  });
  link.click();
  URL.revokeObjectURL(link.href);
  // Remove the spinner
  $export.innerHTML = originalText;
  $export.disabled = false;
});

const getBase64FromImg = (img) => {
  const canvas = Object.assign(document.createElement("canvas"), {
    width: img.naturalWidth,
    height: img.naturalHeight,
  });
  canvas.getContext("2d").drawImage(img, 0, 0);
  return canvas.toDataURL("image/jpeg");
};

// Retry loading images that error out
const retryOnError = (img) => img.addEventListener("error", () => setTimeout(() => (img.src = img.src), 1000));
new MutationObserver((mutations) =>
  mutations.forEach((m) => m.addedNodes.forEach((node) => node.tagName === "IMG" && retryOnError(node))),
).observe($result, { childList: true, subtree: true });

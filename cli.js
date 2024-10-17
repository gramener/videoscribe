import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import multer from "multer";
import fs from "node:fs";
import process from "node:process";
import { Buffer } from "node:buffer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;
const eventStreamHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};
const keyFrameArgs = ["-vf", "select='key',showinfo", "-vsync", "vfr", "-compression_level", "10"];
const audioArgs = ["-b:a", "32k", "-ac", "1", "-ar", "22050"];
const writeEvent = (key, data, res) => {
  const textData = Buffer.from(data).toString("utf-8");
  res.write(`data: ${JSON.stringify({ [key]: textData })}\n\n`);
};

app.use(express.static(path.join(__dirname, "static")));

// Set up multer for handling file uploads
const storage = multer.diskStorage({
  destination: (_req, file, callback) => {
    const uploadDir = path.join("static", "uploads", file.originalname);
    fs.mkdirSync(uploadDir, { recursive: true });
    callback(null, uploadDir);
  },
  filename: (_req, file, callback) => callback(null, file.originalname),
});
const upload = multer({ storage });

const ffmpeg = (args, res) => {
  const ffmpeg = spawn("ffmpeg", ["-y", ...args]);
  ffmpeg.stdout.on("data", (data) => writeEvent("stdout", data, res));
  ffmpeg.stderr.on("data", (data) => writeEvent("stderr", data, res));
  ffmpeg.on("close", (code) => {
    const output = args
      .at(-1)
      .replace(/\\/g, "/")
      .replace(/^static\//, "");
    res.write(`data: ${JSON.stringify({ code, output })}\n\n`);
    res.end();
  });
};

app.post("/audio", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded.");
  const output = path.join(path.dirname(req.file.path), "audio.mp3");
  res.writeHead(200, eventStreamHeaders);
  ffmpeg(["-i", req.file.path, ...audioArgs, output], res);
});

app.post("/keyframes", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded.");
  const output = path.join(path.dirname(req.file.path), "%04d.jpg");
  res.writeHead(200, eventStreamHeaders);
  ffmpeg(["-i", req.file.path, ...keyFrameArgs, output], res);
});

app.listen(port, () => {
  console.log(`Running at http://localhost:${port}`);
});

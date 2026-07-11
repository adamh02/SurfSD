import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// Tells the browser what kind of file it is receiving, like CSS, JavaScript,
// image, or video.
const mimeTypes = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime"
};

// Only these video formats can be uploaded with surf reports.
const allowedVideoTypes = new Map([
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"]
]);

const allowedImageTypes = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"]
]);

// Adds simple response shortcuts so route code is easier to read.
export function decorateResponse(response) {
  response.html = (html, status = 200) => {
    response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  };

  response.redirect = (location, status = 303) => {
    response.writeHead(status, { Location: location });
    response.end();
  };

  response.notFound = () => {
    response.html("<h1>Not Found</h1>", 404);
  };
}

// Reads simple forms, like login and signup.
export async function readForm(request) {
  const body = await readBody(request, 1024 * 1024);
  const params = new URLSearchParams(body.toString());
  return Object.fromEntries(params.entries());
}

// Reads forms that include files, like the create-report form with a video.
export async function readMultipartForm(request) {
  return readMultipartUpload(request, {
    allowedTypes: allowedVideoTypes,
    fileFieldName: "video",
    fileLabel: "Video",
    maxBytes: config.maxUploadBytes,
    typeError: "Video must be MP4, WebM, or MOV."
  });
}

// Profile photos use a smaller limit and only accept browser-friendly images.
export async function readProfileImageForm(request) {
  return readMultipartUpload(request, {
    allowedTypes: allowedImageTypes,
    fileFieldName: "avatar",
    fileLabel: "Profile photo",
    maxBytes: 5 * 1024 * 1024,
    typeError: "Profile photo must be PNG, JPG, or WebP."
  });
}

async function readMultipartUpload(request, { allowedTypes, fileFieldName, fileLabel, maxBytes, typeError }) {
  const contentType = request.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return { fields: {}, file: undefined, errors: ["Invalid upload request."] };

  const body = await readBody(request, maxBytes + 200_000);
  const parts = body.toString("binary").split(`--${boundary}`);
  const fields = {};
  let file;
  const errors = [];

  // Pull out normal text fields plus the one expected upload field.
  for (const part of parts) {
    if (!part.includes("Content-Disposition")) continue;
    const [rawHeaders, rawValue] = part.split("\r\n\r\n");
    if (!rawHeaders || rawValue === undefined) continue;

    const name = rawHeaders.match(/name="([^"]+)"/)?.[1];
    const filename = rawHeaders.match(/filename="([^"]*)"/)?.[1];
    const type = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim();
    const valueBinary = rawValue.replace(/(?:\r\n)+$/g, "");

    if (!filename) {
      fields[name] = Buffer.from(valueBinary, "binary").toString("utf8");
      continue;
    }

    if (!filename.trim()) continue;
    if (name !== fileFieldName) continue;
    if (!allowedTypes.has(type)) {
      errors.push(typeError);
      continue;
    }

    const buffer = Buffer.from(valueBinary, "binary");
    if (buffer.length > maxBytes) {
      errors.push(`${fileLabel} must be ${formatFileSize(maxBytes)} or smaller.`);
      continue;
    }

    // Save the upload under a new random-looking filename, so the user's
    // original filename cannot overwrite another file.
    const safeName = `${Date.now()}-${cryptoRandom()}`;
    const extension = allowedTypes.get(type);
    const relativePath = `/uploads/${safeName}${extension}`;
    const absolutePath = path.join(config.uploadDir, `${safeName}${extension}`);
    fs.mkdirSync(config.uploadDir, { recursive: true });
    fs.writeFileSync(absolutePath, buffer);
    file = { imageUrl: relativePath };
  }

  return { fields, file, errors };
}

function formatFileSize(bytes) {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.round(bytes / 1024)} KB`;
}

// Serves files from the public folder. The path checks stop someone from asking
// for files outside public.
export function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const requestedPath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(config.rootDir, "public", requestedPath.replace(/^\/public\//, ""));

  if (!filePath.startsWith(path.join(config.rootDir, "public"))) {
    response.notFound();
    return true;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, { "Content-Type": mimeTypes[extension] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
  return true;
}

// Reads submitted form data up to a size limit. If it is too big, the route can
// show a friendly error.
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;

    request.on("data", (chunk) => {
      if (finished) return;
      size += chunk.length;
      if (size > limit) {
        finished = true;
        reject(new Error("Request body is too large."));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!finished) resolve(Buffer.concat(chunks));
    });
    request.on("error", (error) => {
      if (!finished) reject(error);
    });
  });
}

// Adds random-looking text to uploaded filenames so names do not clash.
function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10);
}

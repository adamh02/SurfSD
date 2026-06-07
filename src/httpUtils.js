import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const mimeTypes = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

const allowedImageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

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
    response.html("<h1>Not found</h1>", 404);
  };
}

export async function readForm(request) {
  const body = await readBody(request, 1024 * 1024);
  const params = new URLSearchParams(body.toString());
  return Object.fromEntries(params.entries());
}

export async function readMultipartForm(request) {
  const contentType = request.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return { fields: {}, file: undefined, errors: ["Invalid upload request."] };

  const body = await readBody(request, config.maxUploadBytes + 200_000);
  const parts = body.toString("binary").split(`--${boundary}`);
  const fields = {};
  let file;
  const errors = [];

  for (const part of parts) {
    if (!part.includes("Content-Disposition")) continue;
    const [rawHeaders, rawValue] = part.split("\r\n\r\n");
    if (!rawHeaders || rawValue === undefined) continue;

    const name = rawHeaders.match(/name="([^"]+)"/)?.[1];
    const filename = rawHeaders.match(/filename="([^"]*)"/)?.[1];
    const type = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim();
    const valueBinary = rawValue.slice(0, rawValue.lastIndexOf("\r\n"));

    if (!filename) {
      fields[name] = Buffer.from(valueBinary, "binary").toString("utf8");
      continue;
    }

    if (!filename.trim()) continue;
    if (!allowedImageTypes.has(type)) {
      errors.push("Image must be JPEG, PNG, WebP, or GIF.");
      continue;
    }

    const buffer = Buffer.from(valueBinary, "binary");
    if (buffer.length > config.maxUploadBytes) {
      errors.push("Image must be 2 MB or smaller.");
      continue;
    }

    const safeName = `${Date.now()}-${cryptoRandom()}`;
    const extension = allowedImageTypes.get(type);
    const relativePath = `/uploads/${safeName}${extension}`;
    const absolutePath = path.join(config.uploadDir, `${safeName}${extension}`);
    fs.mkdirSync(config.uploadDir, { recursive: true });
    fs.writeFileSync(absolutePath, buffer);
    file = { imageUrl: relativePath };
  }

  return { fields, file, errors };
}

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

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10);
}

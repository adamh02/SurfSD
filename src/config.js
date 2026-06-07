import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  databasePath: process.env.DATABASE_PATH || path.join(rootDir, "surfsd.sqlite"),
  sessionSecret: process.env.SESSION_SECRET || "dev-only-change-me",
  uploadDir: process.env.UPLOAD_DIR || path.join(rootDir, "public", "uploads"),
  maxUploadBytes: 2 * 1024 * 1024
};

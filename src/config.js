import path from "node:path";
import { fileURLToPath } from "node:url";

// Finds the main project folder. This helps file paths work even if npm start is
// launched from a different place.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 3000);

// Main app settings, like the port, database file, and upload folder.
export const config = {
  rootDir,
  port,
  siteUrl: (process.env.SITE_URL || `http://127.0.0.1:${port}`).replace(/\/+$/, ""),
  databasePath: process.env.DATABASE_PATH || path.join(rootDir, "surfsd.sqlite"),
  sessionSecret: process.env.SESSION_SECRET || "dev-only-change-me",
  uploadDir: path.join(rootDir, "public", "uploads"),
  maxUploadBytes: 50 * 1024 * 1024
};

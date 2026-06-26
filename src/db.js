import { DatabaseSync } from "node:sqlite";
import { seedSpots } from "./seedSpots.js";

let database;

export function openDatabase(databasePath) {
  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  migrate();
  seed();
  return database;
}

export function getDatabase() {
  if (!database) {
    throw new Error("Database has not been opened.");
  }
  return database;
}

export function closeDatabase() {
  if (database) {
    database.close();
    database = undefined;
  }
}

function migrate() {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS surf_spots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      description TEXT NOT NULL,
      imageUrl TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      surfSpotId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      imageUrl TEXT,
      description TEXT NOT NULL,
      waveHeight INTEGER NOT NULL,
      rating INTEGER,
      editedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (surfSpotId) REFERENCES surf_spots(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reportId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      parentCommentId INTEGER,
      body TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reportId) REFERENCES reports(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parentCommentId) REFERENCES comments(id) ON DELETE CASCADE
    );
  `);
  migrateReportsOptionalFields();
  migrateReportEdits();
  migrateCommentReplies();
  migrateUserAccountSettings();
}

function migrateUserAccountSettings() {
  const columns = database.prepare("PRAGMA table_info(users)").all();
  if (!columns.some((column) => column.name === "usernameChangedAt")) {
    database.exec("ALTER TABLE users ADD COLUMN usernameChangedAt TEXT");
  }
}

function migrateReportsOptionalFields() {
  const columns = database.prepare("PRAGMA table_info(reports)").all();
  const imageUrlColumn = columns.find((column) => column.name === "imageUrl");
  const ratingColumn = columns.find((column) => column.name === "rating");
  if (!imageUrlColumn?.notnull && !ratingColumn?.notnull) return;

  database.exec(`
    CREATE TABLE reports_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      surfSpotId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      imageUrl TEXT,
      description TEXT NOT NULL,
      waveHeight INTEGER NOT NULL,
      rating INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (surfSpotId) REFERENCES surf_spots(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    INSERT INTO reports_new (id, surfSpotId, userId, imageUrl, description, waveHeight, rating, createdAt)
    SELECT id, surfSpotId, userId, imageUrl, description, waveHeight, rating, createdAt
    FROM reports;

    DROP TABLE reports;
    ALTER TABLE reports_new RENAME TO reports;
  `);
}

function migrateReportEdits() {
  const columns = database.prepare("PRAGMA table_info(reports)").all();
  if (!columns.some((column) => column.name === "editedAt")) {
    database.exec("ALTER TABLE reports ADD COLUMN editedAt TEXT");
  }
}

function migrateCommentReplies() {
  const columns = database.prepare("PRAGMA table_info(comments)").all();
  if (!columns.some((column) => column.name === "parentCommentId")) {
    database.exec("ALTER TABLE comments ADD COLUMN parentCommentId INTEGER REFERENCES comments(id) ON DELETE CASCADE");
  }
}

function seed() {
  const upsert = database.prepare(`
    INSERT INTO surf_spots (name, slug, latitude, longitude, description, imageUrl, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      description = excluded.description,
      imageUrl = excluded.imageUrl,
      difficulty = excluded.difficulty
  `);

  for (const spot of seedSpots) {
    upsert.run(
      spot.name,
      spot.slug,
      spot.latitude,
      spot.longitude,
      spot.description,
      spot.imageUrl,
      spot.difficulty
    );
  }
}

export function createUser({ name, email, passwordHash }) {
  const result = getDatabase()
    .prepare("INSERT INTO users (name, email, passwordHash) VALUES (?, ?, ?)")
    .run(name, email.toLowerCase(), passwordHash);
  return findUserById(result.lastInsertRowid);
}

export function findUserByEmail(email) {
  return getDatabase()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase());
}

export function findUserByName(name) {
  return getDatabase()
    .prepare("SELECT * FROM users WHERE lower(name) = lower(?)")
    .get(name.trim());
}

export function findUserById(id) {
  return getDatabase()
    .prepare("SELECT id, name, email, usernameChangedAt, createdAt FROM users WHERE id = ?")
    .get(id);
}

export function findUserWithPassword(id) {
  return getDatabase()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id);
}

export function updateUsername(userId, name) {
  getDatabase()
    .prepare("UPDATE users SET name = ?, usernameChangedAt = CURRENT_TIMESTAMP WHERE id = ?")
    .run(name, userId);
  return findUserById(userId);
}

export function updatePassword(userId, passwordHash) {
  getDatabase()
    .prepare("UPDATE users SET passwordHash = ? WHERE id = ?")
    .run(passwordHash, userId);
}

export function findMostRecentReportForUser(userId) {
  return getDatabase()
    .prepare(`
      SELECT reports.*, surf_spots.name AS surfSpotName, surf_spots.slug AS surfSpotSlug
      FROM reports
      JOIN surf_spots ON surf_spots.id = reports.surfSpotId
      WHERE reports.userId = ?
      ORDER BY reports.createdAt DESC, reports.id DESC
      LIMIT 1
    `)
    .get(userId);
}

export function listReportsForUser(userId) {
  return getDatabase()
    .prepare(`
      SELECT reports.*, surf_spots.name AS surfSpotName, surf_spots.slug AS surfSpotSlug
      FROM reports
      JOIN surf_spots ON surf_spots.id = reports.surfSpotId
      WHERE reports.userId = ?
      ORDER BY reports.createdAt DESC, reports.id DESC
    `)
    .all(userId);
}

export function findReportForUser(reportId, userId) {
  return getDatabase()
    .prepare(`
      SELECT reports.*, surf_spots.name AS surfSpotName, surf_spots.slug AS surfSpotSlug
      FROM reports
      JOIN surf_spots ON surf_spots.id = reports.surfSpotId
      WHERE reports.id = ? AND reports.userId = ?
    `)
    .get(reportId, userId);
}

export function listSurfSpots() {
  return getDatabase()
    .prepare(`
      SELECT surf_spots.*,
        EXISTS (
          SELECT 1
          FROM reports
          WHERE reports.surfSpotId = surf_spots.id
            AND date(reports.createdAt) = date('now')
        ) AS hasReportToday
      FROM surf_spots
      ORDER BY latitude DESC
    `)
    .all();
}

export function findSurfSpotBySlug(slug) {
  return getDatabase()
    .prepare("SELECT * FROM surf_spots WHERE slug = ?")
    .get(slug);
}

export function createReport({ surfSpotId, userId, imageUrl, description, waveHeight, rating }) {
  const result = getDatabase()
    .prepare(`
      INSERT INTO reports (surfSpotId, userId, imageUrl, description, waveHeight, rating)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(surfSpotId, userId, imageUrl, description, waveHeight, rating);
  return result.lastInsertRowid;
}

export function updateReportForUser({ reportId, userId, description, waveHeight, rating }) {
  const result = getDatabase()
    .prepare(`
      UPDATE reports
      SET description = ?, waveHeight = ?, rating = ?, editedAt = CURRENT_TIMESTAMP
      WHERE id = ?
        AND userId = ?
        AND datetime(createdAt) >= datetime('now', '-3 hours')
    `)
    .run(description, waveHeight, rating, reportId, userId);
  return result.changes > 0;
}

export function deleteReportForUser(reportId, userId) {
  const result = getDatabase()
    .prepare("DELETE FROM reports WHERE id = ? AND userId = ?")
    .run(reportId, userId);
  return result.changes > 0;
}

export function listReportsForSpot(surfSpotId) {
  return getDatabase()
    .prepare(`
      SELECT reports.*,
        users.name AS userName,
        (
          SELECT COUNT(*)
          FROM reports AS user_reports
          WHERE user_reports.userId = users.id
        ) AS userReportCount
      FROM reports
      JOIN users ON users.id = reports.userId
      WHERE reports.surfSpotId = ?
      ORDER BY reports.createdAt DESC, reports.id DESC
    `)
    .all(surfSpotId);
}

export function listCommentsForSpot(surfSpotId) {
  return getDatabase()
    .prepare(`
      SELECT comments.*, users.name AS userName
      FROM comments
      JOIN users ON users.id = comments.userId
      JOIN reports ON reports.id = comments.reportId
      WHERE reports.surfSpotId = ?
      ORDER BY comments.createdAt ASC, comments.id ASC
    `)
    .all(surfSpotId);
}

export function createComment({ reportId, userId, body, parentCommentId = null }) {
  const result = getDatabase()
    .prepare(`
      INSERT INTO comments (reportId, userId, parentCommentId, body)
      SELECT reports.id, ?, ?, ?
      FROM reports
      WHERE reports.id = ?
        AND (
          ? IS NULL OR EXISTS (
            SELECT 1
            FROM comments AS parent_comments
            WHERE parent_comments.id = ?
              AND parent_comments.reportId = reports.id
          )
        )
    `)
    .run(userId, parentCommentId, body, reportId, parentCommentId, parentCommentId);
  return result.changes > 0;
}

export function deleteCommentForUser(commentId, userId) {
  const result = getDatabase()
    .prepare("DELETE FROM comments WHERE id = ? AND userId = ?")
    .run(commentId, userId);
  return result.changes > 0;
}

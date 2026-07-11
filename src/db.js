import { DatabaseSync } from "node:sqlite";
import { seedSpots } from "./seedSpots.js";

let database;

// Opens the database file, makes sure the needed tables exist, and adds the
// default surf spots.
export function openDatabase(databasePath) {
  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  migrate();
  seed();
  return database;
}

// Gives other files access to the open database. If the database was not opened
// yet, show a clear error.
export function getDatabase() {
  if (!database) {
    throw new Error("Database has not been opened.");
  }
  return database;
}

// Tests call this when they are done with a temporary database.
export function closeDatabase() {
  if (database) {
    database.close();
    database = undefined;
  }
}

// Creates the tables if they do not exist yet, then upgrades older local
// databases that are missing newer fields.
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
  migrateUserProfiles();
}

// Adds a place to remember when someone last changed their username.
function migrateUserAccountSettings() {
  const columns = database.prepare("PRAGMA table_info(users)").all();
  if (!columns.some((column) => column.name === "usernameChangedAt")) {
    database.exec("ALTER TABLE users ADD COLUMN usernameChangedAt TEXT");
  }
}

// Adds an optional profile photo to accounts created before public profiles
// were introduced.
function migrateUserProfiles() {
  const columns = database.prepare("PRAGMA table_info(users)").all();
  if (!columns.some((column) => column.name === "avatarUrl")) {
    database.exec("ALTER TABLE users ADD COLUMN avatarUrl TEXT");
  }
}

// Older versions required a media file and rating. This upgrades old databases
// so those fields can be optional.
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

// Adds a place to remember when a report was edited.
function migrateReportEdits() {
  const columns = database.prepare("PRAGMA table_info(reports)").all();
  if (!columns.some((column) => column.name === "editedAt")) {
    database.exec("ALTER TABLE reports ADD COLUMN editedAt TEXT");
  }
}

// Adds a place to connect a reply to the original comment it belongs under.
function migrateCommentReplies() {
  const columns = database.prepare("PRAGMA table_info(comments)").all();
  if (!columns.some((column) => column.name === "parentCommentId")) {
    database.exec("ALTER TABLE comments ADD COLUMN parentCommentId INTEGER REFERENCES comments(id) ON DELETE CASCADE");
  }
}

// Adds each default spot if it is missing. If the spot already exists, update its
// info instead of creating a duplicate.
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

// User-related database helpers.
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

// Normal user lookup leaves out password info so pages do not accidentally use it.
export function findUserById(id) {
  return getDatabase()
    .prepare(`
      SELECT users.id, users.name, users.email, users.avatarUrl,
        users.usernameChangedAt, users.createdAt,
        (SELECT COUNT(*) FROM reports WHERE reports.userId = users.id) AS reportCount,
        (SELECT COUNT(*) FROM comments WHERE comments.userId = users.id) AS commentCount
      FROM users
      WHERE users.id = ?
    `)
    .get(id);
}

// Public profiles never include email addresses or password information.
export function findPublicUserById(id) {
  return getDatabase()
    .prepare(`
      SELECT users.id, users.name, users.avatarUrl, users.createdAt,
        (SELECT COUNT(*) FROM reports WHERE reports.userId = users.id) AS reportCount,
        (SELECT COUNT(*) FROM comments WHERE comments.userId = users.id) AS commentCount
      FROM users
      WHERE users.id = ?
    `)
    .get(id);
}

// Password checks need the saved scrambled password, so this lookup includes it.
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

export function updateUserAvatar(userId, avatarUrl) {
  getDatabase()
    .prepare("UPDATE users SET avatarUrl = ? WHERE id = ?")
    .run(avatarUrl || null, userId);
  return findUserById(userId);
}

// Report history helpers for the account page.
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
      SELECT reports.*, surf_spots.name AS surfSpotName, surf_spots.slug AS surfSpotSlug,
        surf_spots.imageUrl AS surfSpotImageUrl,
        (SELECT COUNT(*) FROM comments WHERE comments.reportId = reports.id) AS commentCount
      FROM reports
      JOIN surf_spots ON surf_spots.id = reports.surfSpotId
      WHERE reports.userId = ?
      ORDER BY reports.createdAt DESC, reports.id DESC
    `)
    .all(userId);
}

// Used before editing to make sure the logged-in user owns the report.
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

// The map needs all surf spots, plus whether each one has a report today.
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

// Report-related database helpers.
export function createReport({ surfSpotId, userId, imageUrl, description, waveHeight, rating }) {
  const result = getDatabase()
    .prepare(`
      INSERT INTO reports (surfSpotId, userId, imageUrl, description, waveHeight, rating)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(surfSpotId, userId, imageUrl, description, waveHeight, rating);
  return result.lastInsertRowid;
}

// Updates a report only when the logged-in user owns it and it is still within
// the 3-hour edit window.
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

// Deletes a report only if it belongs to the logged-in user.
export function deleteReportForUser(reportId, userId) {
  const result = getDatabase()
    .prepare("DELETE FROM reports WHERE id = ? AND userId = ?")
    .run(reportId, userId);
  return result.changes > 0;
}

// Gets reports for a spot, including each author's total report count for badges.
export function listReportsForSpot(surfSpotId) {
  return getDatabase()
    .prepare(`
      SELECT reports.*,
        users.name AS userName,
        users.avatarUrl AS userAvatarUrl,
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

// Gets all comments for one surf spot. app.js later groups them under the right
// report card.
export function listCommentsForSpot(surfSpotId) {
  return getDatabase()
    .prepare(`
      SELECT comments.*, users.name AS userName, users.avatarUrl AS userAvatarUrl
      FROM comments
      JOIN users ON users.id = comments.userId
      JOIN reports ON reports.id = comments.reportId
      WHERE reports.surfSpotId = ?
      ORDER BY comments.createdAt ASC, comments.id ASC
    `)
    .all(surfSpotId);
}

// Powers the homepage, community page, and the report rail beside the map.
export function listRecentReports(limit = 20) {
  return getDatabase()
    .prepare(`
      SELECT reports.*,
        surf_spots.name AS surfSpotName,
        surf_spots.slug AS surfSpotSlug,
        surf_spots.imageUrl AS surfSpotImageUrl,
        surf_spots.difficulty AS surfSpotDifficulty,
        surf_spots.latitude AS surfSpotLatitude,
        users.name AS userName,
        users.avatarUrl AS userAvatarUrl,
        (SELECT COUNT(*) FROM reports AS user_reports WHERE user_reports.userId = users.id) AS userReportCount,
        (SELECT COUNT(*) FROM comments WHERE comments.reportId = reports.id) AS commentCount
      FROM reports
      JOIN surf_spots ON surf_spots.id = reports.surfSpotId
      JOIN users ON users.id = reports.userId
      ORDER BY reports.createdAt DESC, reports.id DESC
      LIMIT ?
    `)
    .all(Number(limit));
}

// Finds the closest breaks for the "Nearby Spots" section on a spot page.
export function listNearbySurfSpots(spot, limit = 3) {
  return getDatabase()
    .prepare(`
      SELECT surf_spots.*,
        ((latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?)) AS distanceScore,
        EXISTS (
          SELECT 1 FROM reports
          WHERE reports.surfSpotId = surf_spots.id
            AND date(reports.createdAt) = date('now')
        ) AS hasReportToday
      FROM surf_spots
      WHERE id != ?
      ORDER BY distanceScore ASC
      LIMIT ?
    `)
    .all(spot.latitude, spot.latitude, spot.longitude, spot.longitude, spot.id, Number(limit));
}

// Saves a comment only if the report exists. For replies, the original comment
// must belong to that same report.
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

// Deletes a comment only if it belongs to the logged-in user.
export function deleteCommentForUser(commentId, userId) {
  const result = getDatabase()
    .prepare("DELETE FROM comments WHERE id = ? AND userId = ?")
    .run(commentId, userId);
  return result.changes > 0;
}

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
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (surfSpotId) REFERENCES surf_spots(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  migrateReportsOptionalFields();
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

export function findUserById(id) {
  return getDatabase()
    .prepare("SELECT id, name, email, createdAt FROM users WHERE id = ?")
    .get(id);
}

export function findUserWithPassword(id) {
  return getDatabase()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id);
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

export function listSurfSpots() {
  return getDatabase()
    .prepare("SELECT * FROM surf_spots ORDER BY latitude DESC")
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

export function listReportsForSpot(surfSpotId) {
  return getDatabase()
    .prepare(`
      SELECT reports.*, users.name AS userName
      FROM reports
      JOIN users ON users.id = reports.userId
      WHERE reports.surfSpotId = ?
      ORDER BY reports.createdAt DESC, reports.id DESC
    `)
    .all(surfSpotId);
}

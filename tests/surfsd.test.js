import assert from "node:assert/strict";
import fs from "node:fs";
import { Readable, Writable } from "node:stream";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { formatCurrentTide } from "../src/conditions.js";
import { closeDatabase, findSurfSpotBySlug, findUserByEmail, getDatabase } from "../src/db.js";
import { resetSessions } from "../src/session.js";

function createTestClient() {
  const databasePath = path.join(os.tmpdir(), `surfsd-${Date.now()}-${Math.random()}.sqlite`);
  const app = createApp({
    databasePath,
    conditionsProvider: async () => ({
      swell: "Test swell",
      tide: "Test tide",
      weather: "Test weather"
    })
  });
  let cookie = "";

  async function request(method, pathname, { body, headers = {} } = {}) {
    const requestBody = body ? Buffer.from(body.toString()) : Buffer.alloc(0);
    const incoming = Readable.from(requestBody);
    incoming.method = method;
    incoming.url = pathname;
    incoming.headers = {
      ...(cookie ? { cookie } : {}),
      ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
    };

    const chunks = [];
    const outgoing = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    });
    outgoing.headers = new Map();
    outgoing.statusCode = 200;
    outgoing.setHeader = (name, value) => outgoing.headers.set(name.toLowerCase(), value);
    outgoing.getHeader = (name) => outgoing.headers.get(name.toLowerCase());
    outgoing.writeHead = (status, headers = {}) => {
      outgoing.statusCode = status;
      for (const [name, value] of Object.entries(headers)) outgoing.setHeader(name, value);
    };

    const ended = new Promise((resolve) => {
      outgoing.end = (chunk) => {
        if (chunk) chunks.push(Buffer.from(chunk));
        Writable.prototype.end.call(outgoing);
        resolve();
      };
    });

    app.emit("request", incoming, outgoing);
    await ended;

    const setCookie = outgoing.getHeader("set-cookie");
    if (setCookie) cookie = String(setCookie).split(";")[0];

    return {
      response: {
        status: outgoing.statusCode,
        headers: {
          get: (name) => outgoing.getHeader(name)
        }
      },
      text: Buffer.concat(chunks).toString("utf8")
    };
  }

  return {
    get: (pathname) => request("GET", pathname),
    postForm: (pathname, data) => request("POST", pathname, {
      body: new URLSearchParams(data),
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }),
    postMultipart: (pathname, fields, file) => {
      const boundary = `----surfsd${Date.now()}`;
      const chunks = [];
      for (const [name, value] of Object.entries(fields)) {
        chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
      }
      if (file) {
        chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`);
        chunks.push(file.body.toString("binary"));
        chunks.push("\r\n");
      }
      chunks.push(`\r\n--${boundary}--\r\n`);
      return request("POST", pathname, {
        body: Buffer.from(chunks.join(""), "binary"),
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` }
      });
    },
    cleanup: async () => {
      closeDatabase();
      resetSessions();
      if (fs.existsSync(databasePath)) fs.unlinkSync(databasePath);
    }
  };
}

test("users can sign up and passwords are hashed", async () => {
  const client = createTestClient();
  try {
    const { response } = await client.postForm("/signup", {
      name: "Kai",
      email: "kai@example.com",
      password: "longboard123",
      next: "/account"
    });

    assert.equal(response.status, 303);
    const storedUser = findUserByEmail("kai@example.com");
    assert.ok(storedUser.passwordHash.startsWith("scrypt:"));
    assert.notEqual(storedUser.passwordHash, "longboard123");
  } finally {
    await client.cleanup();
  }
});

test("account page lists profile settings and report history", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "ReefRider",
      email: "reef@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Account page report test.",
      waveHeight: "5",
      rating: "8"
    });

    const { response, text } = await client.get("/account");
    assert.equal(response.status, 200);
    assert.match(text, /Username/);
    assert.match(text, /ReefRider/);
    assert.match(text, /Email/);
    assert.match(text, /reef@example.com/);
    assert.match(text, /Swami&#039;s/);
    assert.match(text, /5 ft/);
    assert.match(text, /Account Settings/);
    assert.match(text, /Change Username/);
    assert.match(text, /Reset Password/);
    assert.match(text, /Report History/);
    assert.match(text, /Your Reports/);
    assert.match(text, /Account page report test\./);
    assert.match(text, /8\/10 - Good/);
    assert.match(text, /Member Since/);
  } finally {
    await client.cleanup();
  }
});

test("users can change username once every two weeks", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "FirstName",
      email: "name@example.com",
      password: "password123",
      next: "/account"
    });

    const firstChange = await client.postForm("/account/username", { name: "SecondName" });
    assert.equal(firstChange.response.status, 303);
    assert.equal(firstChange.response.headers.get("location"), "/account?message=Username updated.");

    const account = await client.get("/account");
    assert.match(account.text, /SecondName/);

    const secondChange = await client.postForm("/account/username", { name: "ThirdName" });
    assert.equal(secondChange.response.status, 303);
    assert.match(secondChange.response.headers.get("location"), /You%20can%20change%20your%20username%20again/);

    const user = findUserByEmail("name@example.com");
    assert.equal(user.name, "SecondName");
  } finally {
    await client.cleanup();
  }
});

test("users can reset password from account page", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "PasswordUser",
      email: "reset@example.com",
      password: "oldpassword",
      next: "/account"
    });

    const reset = await client.postForm("/account/password", {
      currentPassword: "oldpassword",
      newPassword: "newpassword"
    });
    assert.equal(reset.response.status, 303);
    assert.equal(reset.response.headers.get("location"), "/account?message=Password updated.");

    await client.get("/logout");
    const oldLogin = await client.postForm("/login", {
      email: "reset@example.com",
      password: "oldpassword"
    });
    assert.equal(oldLogin.response.status, 401);

    const newLogin = await client.postForm("/login", {
      email: "reset@example.com",
      password: "newpassword"
    });
    assert.equal(newLogin.response.status, 303);
  } finally {
    await client.cleanup();
  }
});

test("users can log in with email or username", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "UsernameLogin",
      email: "username-login@example.com",
      password: "password123",
      next: "/account"
    });

    await client.get("/logout");
    const usernameLogin = await client.postForm("/login", {
      email: "UsernameLogin",
      password: "password123"
    });
    assert.equal(usernameLogin.response.status, 303);
    assert.equal(usernameLogin.response.headers.get("location"), "/account");

    await client.get("/logout");
    const emailLogin = await client.postForm("/login", {
      email: "username-login@example.com",
      password: "password123"
    });
    assert.equal(emailLogin.response.status, 303);
    assert.equal(emailLogin.response.headers.get("location"), "/account");
  } finally {
    await client.cleanup();
  }
});

test("surf spot pages load correctly", async () => {
  const client = createTestClient();
  try {
    const { response, text } = await client.get("/spots/swamis");
    assert.equal(response.status, 200);
    assert.match(text, /Swami&#039;s/);
    assert.match(text, /<time datetime="[^"]+">[^<]+<\/time>/);
    assert.match(text, /Recent Reports/);
  } finally {
    await client.cleanup();
  }
});

test("map conditions show a live timestamp", async () => {
  const client = createTestClient();
  try {
    const { response, text } = await client.get("/map");
    assert.equal(response.status, 200);
    assert.match(text, /Live San Diego report/);
    assert.match(text, /<time datetime="[^"]+">[^<]+<\/time>/);
  } finally {
    await client.cleanup();
  }
});

test("local surf spot images load correctly", async () => {
  const client = createTestClient();
  try {
    const { response } = await client.get("/spot-images/oceanside-pier.png");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
  } finally {
    await client.cleanup();
  }
});

test("logged-out users cannot create reports", async () => {
  const client = createTestClient();
  try {
    const { response } = await client.get("/spots/swamis/reports/new");
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location").startsWith("/account?next="), true);
  } finally {
    await client.cleanup();
  }
});

test("oversized requests return an error without taking down the app", async () => {
  const client = createTestClient();
  try {
    const oversizedName = "x".repeat(1024 * 1024 + 1);
    const { response } = await client.postForm("/signup", {
      name: oversizedName,
      email: "large@example.com",
      password: "password123",
      next: "/account"
    });
    assert.equal(response.status, 413);

    const mapPage = await client.get("/map");
    assert.equal(mapPage.response.status, 200);
    assert.match(mapPage.text, /SurfSD/);
  } finally {
    await client.cleanup();
  }
});

test("logged-in users can create a surf report", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "Maya",
      email: "maya@example.com",
      password: "reefbreak123",
      next: "/account"
    });

    const mp4 = Buffer.from("00000018667479706d703432000000006d703432", "hex");
    const { response } = await client.postMultipart("/spots/swamis/reports", {
      description: "Clean lines and patient sets.",
      waveHeight: "4",
      rating: "8"
    }, {
      filename: "report.mp4",
      type: "video/mp4",
      body: mp4
    });
    assert.equal(response.status, 303);

    const reports = getDatabase().prepare("SELECT * FROM reports").all();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].waveHeight, 4);

    const spotPage = await client.get("/spots/swamis");
    assert.match(spotPage.text, /Clean lines and patient sets./);
    assert.match(spotPage.text, /8\/10 - Good/);
    assert.match(spotPage.text, /(just now|\d+ minutes ago)/);
  } finally {
    await client.cleanup();
  }
});

test("map marks spots with reports from today", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "Daily Reporter",
      email: "daily@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Fresh report for the map.",
      waveHeight: "4",
      rating: "8"
    });

    const { response, text } = await client.get("/map");
    assert.equal(response.status, 200);
    assert.match(text, /&quot;slug&quot;:&quot;swamis&quot;/);
    assert.match(text, /&quot;hasReportToday&quot;:true/);
  } finally {
    await client.cleanup();
  }
});

test("surf report authors earn milestone badges", async () => {
  const client = createTestClient();
  try {
    const users = [
      ["TenPoster", "ten@example.com", 10, /10 Reports/],
      ["HundredPoster", "hundred@example.com", 100, /100 Reports/],
      ["ThousandPoster", "thousand@example.com", 1000, /1K Reports/]
    ];
    const swamis = findSurfSpotBySlug("swamis");
    const windansea = findSurfSpotBySlug("windansea");
    const insertReport = getDatabase().prepare(`
      INSERT INTO reports (surfSpotId, userId, imageUrl, description, waveHeight, rating)
      VALUES (?, ?, NULL, ?, 4, 8)
    `);

    for (const [name, email, reportCount] of users) {
      await client.postForm("/signup", {
        name,
        email,
        password: "password123",
        next: "/account"
      });
      const user = findUserByEmail(email);
      for (let index = 0; index < reportCount - 1; index += 1) {
        insertReport.run(windansea.id, user.id, `${name} milestone filler ${index}.`);
      }
      insertReport.run(swamis.id, user.id, `${name} visible milestone report.`);
      await client.get("/logout");
    }

    const spotPage = await client.get("/spots/swamis");
    for (const [, , , pattern] of users) {
      assert.match(spotPage.text, pattern);
    }
  } finally {
    await client.cleanup();
  }
});

test("report ratings include condition labels", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "Rating Labels",
      email: "ratings@example.com",
      password: "password123",
      next: "/account"
    });

    const ratings = [
      ["Firing report.", "9", /9\/10 - Firing/],
      ["Good report.", "8", /8\/10 - Good/],
      ["Decent report.", "7", /7\/10 - Decent/],
      ["Mediocre report.", "5", /5\/10 - Mediocre/],
      ["Poor report.", "3", /3\/10 - Poor/]
    ];

    for (const [description, rating] of ratings) {
      const { response } = await client.postMultipart("/spots/swamis/reports", {
        description,
        waveHeight: "3",
        rating
      });
      assert.equal(response.status, 303);
    }

    const spotPage = await client.get("/spots/swamis");
    for (const [, , pattern] of ratings) {
      assert.match(spotPage.text, pattern);
    }
  } finally {
    await client.cleanup();
  }
});

test("report form validation rejects bad input", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "Nico",
      email: "nico@example.com",
      password: "password123",
      next: "/account"
    });

    const mp4 = Buffer.from("00000018667479706d703432000000006d703432", "hex");
    const { response, text } = await client.postMultipart("/spots/swamis/reports", {
      description: "Bad",
      waveHeight: "101",
      rating: "0"
    }, {
      filename: "report.mp4",
      type: "video/mp4",
      body: mp4
    });

    assert.equal(response.status, 422);
    assert.match(text, /Description must be between 5 and 280 characters./);
    assert.match(text, /Wave height must be a number from 1 to 100 feet./);
    assert.match(text, /Rating must be a number from 1 to 10./);
  } finally {
    await client.cleanup();
  }
});

test("report form allows wave heights up to 100 feet", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "Big Wave",
      email: "bigwave@example.com",
      password: "password123",
      next: "/account"
    });

    const mp4 = Buffer.from("00000018667479706d703432000000006d703432", "hex");
    const { response } = await client.postMultipart("/spots/swamis/reports", {
      description: "Huge but still valid in the form.",
      waveHeight: "100",
      rating: "9"
    }, {
      filename: "report.mp4",
      type: "video/mp4",
      body: mp4
    });

    assert.equal(response.status, 303);
    const reports = getDatabase().prepare("SELECT * FROM reports").all();
    assert.equal(reports[0].waveHeight, 100);
  } finally {
    await client.cleanup();
  }
});

test("report form allows optional video and rating", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "Optional Fields",
      email: "optional@example.com",
      password: "password123",
      next: "/account"
    });

    const { response } = await client.postMultipart("/spots/swamis/reports", {
      description: "Quick text-only condition note.",
      waveHeight: "3",
      rating: ""
    });

    assert.equal(response.status, 303);
    const reports = getDatabase().prepare("SELECT * FROM reports").all();
    assert.equal(reports[0].imageUrl, null);
    assert.equal(reports[0].rating, null);

    const spotPage = await client.get("/spots/swamis");
    assert.match(spotPage.text, /No video/);
    assert.match(spotPage.text, /No rating/);
  } finally {
    await client.cleanup();
  }
});

test("tide conditions show current feet and rising trend", () => {
  const now = new Date("2026-06-09T12:06:00");
  const previous = new Date("2026-06-09T12:00:00");
  const tide = formatCurrentTide([
    { t: formatLocalApiTime(previous), v: "2.14" },
    { t: formatLocalApiTime(now), v: "2.41" }
  ], now.getTime());

  assert.equal(tide, "2.4 ft rising");
});

test("tide conditions show current feet and falling trend", () => {
  const now = new Date("2026-06-09T12:06:00");
  const previous = new Date("2026-06-09T12:00:00");
  const tide = formatCurrentTide([
    { t: formatLocalApiTime(previous), v: "3.02" },
    { t: formatLocalApiTime(now), v: "2.76" }
  ], now.getTime());

  assert.equal(tide, "2.8 ft falling");
});

function formatLocalApiTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

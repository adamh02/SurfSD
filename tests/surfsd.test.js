import assert from "node:assert/strict";
import fs from "node:fs";
import { Readable, Writable } from "node:stream";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { closeDatabase, findUserByEmail, getDatabase } from "../src/db.js";
import { resetSessions } from "../src/session.js";

function createTestClient() {
  const databasePath = path.join(os.tmpdir(), `surfsd-${Date.now()}-${Math.random()}.sqlite`);
  const app = createApp({ databasePath });
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
        chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`);
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

test("surf spot pages load correctly", async () => {
  const client = createTestClient();
  try {
    const { response, text } = await client.get("/spots/swamis");
    assert.equal(response.status, 200);
    assert.match(text, /Swami&#039;s/);
    assert.match(text, /Recent reports/);
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

test("logged-in users can create a surf report", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "Maya",
      email: "maya@example.com",
      password: "reefbreak123",
      next: "/account"
    });

    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const { response } = await client.postMultipart("/spots/swamis/reports", {
      description: "Clean lines and patient sets.",
      waveHeight: "4",
      rating: "8"
    }, {
      filename: "report.png",
      type: "image/png",
      body: png
    });
    assert.equal(response.status, 303);

    const reports = getDatabase().prepare("SELECT * FROM reports").all();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].waveHeight, 4);

    const spotPage = await client.get("/spots/swamis");
    assert.match(spotPage.text, /Clean lines and patient sets./);
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

    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const { response, text } = await client.postMultipart("/spots/swamis/reports", {
      description: "Bad",
      waveHeight: "101",
      rating: "0"
    }, {
      filename: "report.png",
      type: "image/png",
      body: png
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

    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const { response } = await client.postMultipart("/spots/swamis/reports", {
      description: "Huge but still valid in the form.",
      waveHeight: "100",
      rating: "9"
    }, {
      filename: "report.png",
      type: "image/png",
      body: png
    });

    assert.equal(response.status, 303);
    const reports = getDatabase().prepare("SELECT * FROM reports").all();
    assert.equal(reports[0].waveHeight, 100);
  } finally {
    await client.cleanup();
  }
});

test("report form allows optional photo and rating", async () => {
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
    assert.match(spotPage.text, /No photo/);
    assert.match(spotPage.text, /No rating/);
  } finally {
    await client.cleanup();
  }
});

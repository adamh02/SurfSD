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
    assert.match(text, /Edit Report/);
    assert.match(text, /Delete Report/);
    assert.match(text, /data-confirm="Are you sure you want to delete this surf report\?"/);
    assert.match(text, /Member Since/);
  } finally {
    await client.cleanup();
  }
});

test("users can delete their own reports", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "DeleteOwner",
      email: "delete-owner@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Delete this report.",
      waveHeight: "4",
      rating: "7"
    });

    const report = getDatabase().prepare("SELECT * FROM reports").get();
    const deleted = await client.postForm(`/reports/${report.id}/delete`, {});
    assert.equal(deleted.response.status, 303);
    assert.equal(deleted.response.headers.get("location"), "/account?message=Report Deleted");
    assert.equal(getDatabase().prepare("SELECT COUNT(*) AS count FROM reports").get().count, 0);

    const account = await client.get("/account");
    assert.match(account.text, /No reports yet/);
  } finally {
    await client.cleanup();
  }
});

test("users cannot delete another user's report", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "ReportOwner",
      email: "report-owner@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Someone else's report.",
      waveHeight: "4",
      rating: "7"
    });
    const report = getDatabase().prepare("SELECT * FROM reports").get();

    await client.get("/logout");
    await client.postForm("/signup", {
      name: "OtherUser",
      email: "other-user@example.com",
      password: "password123",
      next: "/account"
    });

    const blocked = await client.postForm(`/reports/${report.id}/delete`, {});
    assert.equal(blocked.response.status, 303);
    assert.equal(blocked.response.headers.get("location"), "/account?error=Report could not be deleted.");
    assert.equal(getDatabase().prepare("SELECT COUNT(*) AS count FROM reports").get().count, 1);
  } finally {
    await client.cleanup();
  }
});

test("users can edit their own reports within three hours", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "EditOwner",
      email: "edit-owner@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Original report text.",
      waveHeight: "4",
      rating: "6"
    });
    const report = getDatabase().prepare("SELECT * FROM reports").get();

    const editPage = await client.get(`/reports/${report.id}/edit`);
    assert.equal(editPage.response.status, 200);
    assert.match(editPage.text, /Edit report/);

    const updated = await client.postForm(`/reports/${report.id}/edit`, {
      description: "Updated report text.",
      waveHeight: "5",
      rating: "8"
    });
    assert.equal(updated.response.status, 303);
    assert.equal(updated.response.headers.get("location"), "/account?message=Report Updated");

    const stored = getDatabase().prepare("SELECT * FROM reports WHERE id = ?").get(report.id);
    assert.equal(stored.description, "Updated report text.");
    assert.equal(stored.waveHeight, 5);
    assert.equal(stored.rating, 8);
    assert.ok(stored.editedAt);

    const spotPage = await client.get("/spots/swamis");
    assert.match(spotPage.text, /Updated report text\./);
    assert.match(spotPage.text, /Edited/);
    assert.match(spotPage.text, /8\/10 - Good/);
  } finally {
    await client.cleanup();
  }
});

test("users cannot edit reports after three hours", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "LateEditor",
      email: "late-editor@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Old report text.",
      waveHeight: "4",
      rating: "6"
    });
    const report = getDatabase().prepare("SELECT * FROM reports").get();
    getDatabase()
      .prepare("UPDATE reports SET createdAt = datetime('now', '-4 hours') WHERE id = ?")
      .run(report.id);

    const editPage = await client.get(`/reports/${report.id}/edit`);
    assert.equal(editPage.response.status, 303);
    assert.equal(editPage.response.headers.get("location"), "/account?error=Reports can only be edited within 3 hours.");

    const blocked = await client.postForm(`/reports/${report.id}/edit`, {
      description: "Late update.",
      waveHeight: "6",
      rating: "9"
    });
    assert.equal(blocked.response.status, 303);
    assert.equal(blocked.response.headers.get("location"), "/account?error=Reports can only be edited within 3 hours.");

    const stored = getDatabase().prepare("SELECT * FROM reports WHERE id = ?").get(report.id);
    assert.equal(stored.description, "Old report text.");
    assert.equal(stored.editedAt, null);

    const account = await client.get("/account");
    assert.doesNotMatch(account.text, /Edit Report/);
  } finally {
    await client.cleanup();
  }
});

test("users can comment on surf reports", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "ReportPoster",
      email: "poster@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Comment target report.",
      waveHeight: "4",
      rating: "7"
    });
    const report = getDatabase().prepare("SELECT * FROM reports").get();

    await client.get("/logout");
    await client.postForm("/signup", {
      name: "Commenter",
      email: "commenter@example.com",
      password: "password123",
      next: "/account"
    });

    const posted = await client.postForm(`/reports/${report.id}/comments`, {
      body: "Thanks for the update!",
      next: "/spots/swamis"
    });
    assert.equal(posted.response.status, 303);
    assert.equal(posted.response.headers.get("location"), `/spots/swamis#report-${report.id}`);

    const spotPage = await client.get("/spots/swamis");
    assert.match(spotPage.text, /<details class="report-comments">/);
    assert.match(spotPage.text, /<summary>1 Comment<\/summary>/);
    assert.match(spotPage.text, /Commenter/);
    assert.match(spotPage.text, /Thanks for the update!/);
  } finally {
    await client.cleanup();
  }
});

test("users can reply to a specific comment", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "ThreadPoster",
      email: "thread-poster@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Threaded comment target.",
      waveHeight: "4",
      rating: "7"
    });
    const report = getDatabase().prepare("SELECT * FROM reports").get();

    const firstComment = await client.postForm(`/reports/${report.id}/comments`, {
      body: "First comment in the thread.",
      next: "/spots/swamis"
    });
    assert.equal(firstComment.response.headers.get("location"), `/spots/swamis#report-${report.id}`);
    const parentComment = getDatabase().prepare("SELECT * FROM comments WHERE reportId = ?").get(report.id);

    const reply = await client.postForm(`/reports/${report.id}/comments`, {
      body: "Replying directly to that comment.",
      parentCommentId: String(parentComment.id),
      next: "/spots/swamis"
    });
    assert.equal(reply.response.status, 303);
    assert.equal(reply.response.headers.get("location"), `/spots/swamis#report-${report.id}`);

    const comments = getDatabase().prepare("SELECT * FROM comments ORDER BY id").all();
    assert.equal(comments.length, 2);
    assert.equal(comments[1].parentCommentId, parentComment.id);

    const spotPage = await client.get("/spots/swamis");
    assert.match(spotPage.text, /First comment in the thread\./);
    assert.match(spotPage.text, /Replying directly to that comment\./);
    assert.match(spotPage.text, /comment-replies/);
    assert.match(spotPage.text, /data-reply-toggle/);
    assert.match(spotPage.text, /reply-form-shell" hidden/);
    assert.match(spotPage.text, /Post Reply/);
    assert.equal((spotPage.text.match(/Post Reply/g) || []).length, 1);
  } finally {
    await client.cleanup();
  }
});

test("comment replies must belong to the same report", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "ReplyGuard",
      email: "reply-guard@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "First report.",
      waveHeight: "4",
      rating: "7"
    });
    await client.postMultipart("/spots/windansea/reports", {
      description: "Second report.",
      waveHeight: "5",
      rating: "8"
    });
    const reports = getDatabase().prepare("SELECT * FROM reports ORDER BY id").all();

    await client.postForm(`/reports/${reports[0].id}/comments`, {
      body: "Parent belongs to the first report.",
      next: "/spots/swamis"
    });
    const parentComment = getDatabase().prepare("SELECT * FROM comments WHERE reportId = ?").get(reports[0].id);

    const blocked = await client.postForm(`/reports/${reports[1].id}/comments`, {
      body: "This reply should not attach.",
      parentCommentId: String(parentComment.id),
      next: "/spots/windansea"
    });
    assert.equal(blocked.response.status, 303);
    assert.equal(blocked.response.headers.get("location"), `/spots/windansea?error=Comment%20could%20not%20be%20posted.#report-${reports[1].id}`);
    assert.equal(getDatabase().prepare("SELECT COUNT(*) AS count FROM comments").get().count, 1);
  } finally {
    await client.cleanup();
  }
});

test("users can delete their own comments", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "CommentOwner",
      email: "comment-owner@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Comment delete target.",
      waveHeight: "4",
      rating: "7"
    });
    const report = getDatabase().prepare("SELECT * FROM reports").get();

    await client.postForm(`/reports/${report.id}/comments`, {
      body: "Delete this comment.",
      next: "/spots/swamis"
    });
    const comment = getDatabase().prepare("SELECT * FROM comments").get();

    const deleted = await client.postForm(`/comments/${comment.id}/delete`, {
      next: "/spots/swamis",
      reportId: String(report.id)
    });
    assert.equal(deleted.response.status, 303);
    assert.equal(deleted.response.headers.get("location"), `/spots/swamis#report-${report.id}`);
    assert.equal(getDatabase().prepare("SELECT COUNT(*) AS count FROM comments").get().count, 0);
  } finally {
    await client.cleanup();
  }
});

test("comment delete forms use confirmation prompts", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "ConfirmComment",
      email: "confirm-comment@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Confirm comment target.",
      waveHeight: "4",
      rating: "7"
    });
    const report = getDatabase().prepare("SELECT * FROM reports").get();
    await client.postForm(`/reports/${report.id}/comments`, {
      body: "Confirm before deleting this.",
      next: "/spots/swamis"
    });

    const spotPage = await client.get("/spots/swamis");
    assert.match(spotPage.text, /comment-delete-button/);
    assert.match(spotPage.text, /data-confirm="Are you sure you want to delete this comment\?"/);
    assert.doesNotMatch(spotPage.text, /onclick="return confirm/);
  } finally {
    await client.cleanup();
  }
});

test("users cannot delete another user's comment", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "OriginalCommenter",
      email: "original-commenter@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Comment ownership target.",
      waveHeight: "4",
      rating: "7"
    });
    const report = getDatabase().prepare("SELECT * FROM reports").get();
    await client.postForm(`/reports/${report.id}/comments`, {
      body: "Do not delete this.",
      next: "/spots/swamis"
    });
    const comment = getDatabase().prepare("SELECT * FROM comments").get();

    await client.get("/logout");
    await client.postForm("/signup", {
      name: "CommentIntruder",
      email: "comment-intruder@example.com",
      password: "password123",
      next: "/account"
    });

    const blocked = await client.postForm(`/comments/${comment.id}/delete`, {
      next: "/spots/swamis",
      reportId: String(report.id)
    });
    assert.equal(blocked.response.status, 303);
    assert.equal(blocked.response.headers.get("location"), `/spots/swamis?error=Comment%20could%20not%20be%20deleted.#report-${report.id}`);
    assert.equal(getDatabase().prepare("SELECT COUNT(*) AS count FROM comments").get().count, 1);
  } finally {
    await client.cleanup();
  }
});

test("deleting a parent comment removes its replies", async () => {
  const client = createTestClient();
  try {
    await client.postForm("/signup", {
      name: "ThreadDeleter",
      email: "thread-deleter@example.com",
      password: "password123",
      next: "/account"
    });

    await client.postMultipart("/spots/swamis/reports", {
      description: "Thread delete target.",
      waveHeight: "4",
      rating: "7"
    });
    const report = getDatabase().prepare("SELECT * FROM reports").get();
    await client.postForm(`/reports/${report.id}/comments`, {
      body: "Parent comment.",
      next: "/spots/swamis"
    });
    const parent = getDatabase().prepare("SELECT * FROM comments").get();
    await client.postForm(`/reports/${report.id}/comments`, {
      body: "Child reply.",
      parentCommentId: String(parent.id),
      next: "/spots/swamis"
    });

    const deleted = await client.postForm(`/comments/${parent.id}/delete`, {
      next: "/spots/swamis",
      reportId: String(report.id)
    });
    assert.equal(deleted.response.status, 303);
    assert.equal(getDatabase().prepare("SELECT COUNT(*) AS count FROM comments").get().count, 0);
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

test("delete confirmations are wired without inline scripts", async () => {
  const client = createTestClient();
  try {
    const { response, text } = await client.get("/map.js");
    assert.equal(response.status, 200);
    assert.match(text, /initializeConfirmForms/);
    assert.match(text, /form\[data-confirm\]/);
    assert.match(text, /window\.confirm/);
    assert.match(text, /initializeReplyToggles/);
    assert.match(text, /data-reply-toggle/);
    assert.match(text, /New Report Today/);
  } finally {
    await client.cleanup();
  }
});

test("login password can be shown while typing", async () => {
  const client = createTestClient();
  try {
    const { response, text } = await client.get("/account");
    assert.equal(response.status, 200);
    assert.match(text, /data-password-toggle-input/);
    assert.match(text, /data-password-toggle/);
    assert.match(text, /aria-label="Show password"/);

    const script = await client.get("/map.js");
    assert.equal(script.response.status, 200);
    assert.match(script.text, /initializePasswordToggles/);
    assert.match(script.text, /input\.type === "password"/);
    assert.match(script.text, /Hide password/);
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

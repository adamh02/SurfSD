import crypto from "node:crypto";
import { config } from "./config.js";

// A session is how the app remembers someone is logged in. The browser gets a
// random ID in a cookie, and the server uses that ID to find the user.
const sessions = new Map();
const cookieName = "surfsd_session";

// Reads the login cookie. If it is missing or looks fake, treat the user as
// logged out.
export function readSession(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const sid = verifySignedValue(cookies[cookieName]);
  if (!sid) return {};
  return sessions.get(sid) || {};
}

// Creates a new login cookie after signup/login.
export function writeSession(response, session) {
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, session);
  response.setHeader("Set-Cookie", `${cookieName}=${signValue(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

// Logs the user out by deleting the saved session and clearing the browser cookie.
export function destroySession(request, response) {
  const cookies = parseCookies(request.headers.cookie || "");
  const sid = verifySignedValue(cookies[cookieName]);
  if (sid) sessions.delete(sid);
  response.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Turns the long Cookie header string into an easier object we can read.
function parseCookies(cookieHeader) {
  return cookieHeader.split(";").reduce((cookies, pair) => {
    const [key, value] = pair.trim().split("=");
    if (key) cookies[key] = decodeURIComponent(value || "");
    return cookies;
  }, {});
}

// Tests use this to start with no one logged in.
export function resetSessions() {
  sessions.clear();
}

// Adds a secret proof to the cookie value, so users cannot edit the cookie and
// pretend to be someone else.
function signValue(value) {
  const signature = crypto.createHmac("sha256", config.sessionSecret).update(value).digest("hex");
  return `${value}.${signature}`;
}

// Checks that the cookie still has the correct secret proof attached.
function verifySignedValue(signedValue = "") {
  const [value, signature] = signedValue.split(".");
  if (!value || !signature) return undefined;
  const expected = crypto.createHmac("sha256", config.sessionSecret).update(value).digest("hex");
  if (signature.length !== expected.length) return undefined;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? value : undefined;
}

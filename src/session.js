import crypto from "node:crypto";
import { config } from "./config.js";

const sessions = new Map();
const cookieName = "surfsd_session";

export function readSession(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const sid = verifySignedValue(cookies[cookieName]);
  if (!sid) return {};
  return sessions.get(sid) || {};
}

export function writeSession(response, session) {
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, session);
  response.setHeader("Set-Cookie", `${cookieName}=${signValue(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

export function destroySession(request, response) {
  const cookies = parseCookies(request.headers.cookie || "");
  const sid = verifySignedValue(cookies[cookieName]);
  if (sid) sessions.delete(sid);
  response.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(";").reduce((cookies, pair) => {
    const [key, value] = pair.trim().split("=");
    if (key) cookies[key] = decodeURIComponent(value || "");
    return cookies;
  }, {});
}

export function resetSessions() {
  sessions.clear();
}

function signValue(value) {
  const signature = crypto.createHmac("sha256", config.sessionSecret).update(value).digest("hex");
  return `${value}.${signature}`;
}

function verifySignedValue(signedValue = "") {
  const [value, signature] = signedValue.split(".");
  if (!value || !signature) return undefined;
  const expected = crypto.createHmac("sha256", config.sessionSecret).update(value).digest("hex");
  if (signature.length !== expected.length) return undefined;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? value : undefined;
}

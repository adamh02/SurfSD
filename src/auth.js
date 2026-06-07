import crypto from "node:crypto";
import { createUser, findUserByEmail, findUserById } from "./db.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup({ name = "", email = "", password = "" }) {
  const errors = [];
  if (name.trim().length < 2) errors.push("Name must be at least 2 characters.");
  if (!emailPattern.test(email.trim())) errors.push("Enter a valid email address.");
  if (password.length < 8) errors.push("Password must be at least 8 characters.");
  return errors;
}

export function validateLogin({ email = "", password = "" }) {
  const errors = [];
  if (!emailPattern.test(email.trim())) errors.push("Enter a valid email address.");
  if (!password) errors.push("Password is required.");
  return errors;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [method, salt, hash] = String(storedHash).split(":");
  if (method !== "scrypt" || !salt || !hash) return false;

  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

export function signup({ name, email, password }) {
  const existing = findUserByEmail(email);
  if (existing) {
    return { errors: ["An account with that email already exists."] };
  }

  const user = createUser({
    name: name.trim(),
    email: email.trim(),
    passwordHash: hashPassword(password)
  });

  return { user };
}

export function login({ email, password }) {
  const user = findUserByEmail(email.trim());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { errors: ["Email or password is incorrect."] };
  }
  return { user: findUserById(user.id) };
}

export function requireUser(request, response) {
  if (request.user) return true;
  response.redirect(`/account?next=${encodeURIComponent(request.url)}&error=${encodeURIComponent("Please log in to create a report.")}`);
  return false;
}

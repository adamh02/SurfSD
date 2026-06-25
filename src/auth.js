import crypto from "node:crypto";
import { createUser, findUserByEmail, findUserById, findUserByName, findUserWithPassword, updatePassword, updateUsername } from "./db.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup({ name = "", email = "", password = "" }) {
  const errors = [];
  if (name.trim().length < 2) errors.push("Username must be at least 2 characters.");
  if (!emailPattern.test(email.trim())) errors.push("Enter a valid email address.");
  if (password.length < 8) errors.push("Password must be at least 8 characters.");
  return errors;
}

export function validateLogin({ email = "", password = "" }) {
  const errors = [];
  if (!email.trim()) errors.push("Enter your email or username.");
  if (!password) errors.push("Password is required.");
  return errors;
}

export function validateUsernameChange({ name = "" }) {
  const errors = [];
  if (name.trim().length < 2) errors.push("Username must be at least 2 characters.");
  if (name.trim().length > 32) errors.push("Username must be 32 characters or fewer.");
  return errors;
}

export function validatePasswordReset({ currentPassword = "", newPassword = "" }) {
  const errors = [];
  if (!currentPassword) errors.push("Current password is required.");
  if (newPassword.length < 8) errors.push("New password must be at least 8 characters.");
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
  const identifier = email.trim();
  const user = emailPattern.test(identifier) ? findUserByEmail(identifier) : findUserByName(identifier);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { errors: ["Email, username, or password is incorrect."] };
  }
  return { user: findUserById(user.id) };
}

export function changeUsername(user, form, now = new Date()) {
  const errors = validateUsernameChange(form);
  if (errors.length) return { errors };

  if (user.usernameChangedAt) {
    const lastChanged = new Date(`${String(user.usernameChangedAt).replace(" ", "T")}Z`);
    const cooldownMs = 14 * 24 * 60 * 60 * 1000;
    const nextChange = new Date(lastChanged.getTime() + cooldownMs);
    if (now < nextChange) {
      return { errors: [`You can change your username again on ${formatDate(nextChange)}.`] };
    }
  }

  return { user: updateUsername(user.id, form.name.trim()) };
}

export function resetPassword(userId, form) {
  const errors = validatePasswordReset(form);
  if (errors.length) return { errors };

  const user = findUserWithPassword(userId);
  if (!user || !verifyPassword(form.currentPassword, user.passwordHash)) {
    return { errors: ["Current password is incorrect."] };
  }

  updatePassword(userId, hashPassword(form.newPassword));
  return {};
}

export function requireUser(request, response) {
  if (request.user) return true;
  response.redirect(`/account?next=${encodeURIComponent(request.url)}&error=${encodeURIComponent("Please log in to create a report.")}`);
  return false;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(value);
}

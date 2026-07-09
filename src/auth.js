import crypto from "node:crypto";
import { createUser, findUserByEmail, findUserById, findUserByName, findUserWithPassword, updatePassword, updateUsername } from "./db.js";

// Quick email check. This does not prove the email is real; it just catches
// obvious mistakes like missing "@".
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Checks the signup form before we try to save anything.
export function validateSignup({ name = "", email = "", password = "" }) {
  const errors = [];
  if (name.trim().length < 2) errors.push("Username must be at least 2 characters.");
  if (!emailPattern.test(email.trim())) errors.push("Enter a valid email address.");
  if (password.length < 8) errors.push("Password must be at least 8 characters.");
  return errors;
}

// The login form lets people type either their email or their username.
export function validateLogin({ email = "", password = "" }) {
  const errors = [];
  if (!email.trim()) errors.push("Enter your email or username.");
  if (!password) errors.push("Password is required.");
  return errors;
}

// Keeps usernames short enough to look good on the site.
export function validateUsernameChange({ name = "" }) {
  const errors = [];
  if (name.trim().length < 2) errors.push("Username must be at least 2 characters.");
  if (name.trim().length > 32) errors.push("Username must be 32 characters or fewer.");
  return errors;
}

// Before changing a password, users must type their old password and choose a
// new password that is long enough.
export function validatePasswordReset({ currentPassword = "", newPassword = "" }) {
  const errors = [];
  if (!currentPassword) errors.push("Current password is required.");
  if (newPassword.length < 8) errors.push("New password must be at least 8 characters.");
  return errors;
}

// Passwords are never saved as plain text. Instead, we turn the password into a
// scrambled version that cannot easily be turned back into the original password.
// The extra random text makes two people with the same password still look
// different in the database.
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

// When someone logs in, we scramble what they typed the same way and compare it
// to the scrambled password saved in the database.
export function verifyPassword(password, storedHash) {
  const [method, salt, hash] = String(storedHash).split(":");
  if (method !== "scrypt" || !salt || !hash) return false;

  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

// Creates a new user after making sure the email is not already taken.
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

// Finds the account by email or username, then checks if the password matches.
export function login({ email, password }) {
  const identifier = email.trim();
  const user = emailPattern.test(identifier) ? findUserByEmail(identifier) : findUserByName(identifier);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { errors: ["Email, username, or password is incorrect."] };
  }
  return { user: findUserById(user.id) };
}

// Users can only change their username once every 14 days, so report/comment
// history does not get confusing.
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

// Checks the current password before saving the new scrambled password.
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

// Used by pages/actions that require login. If someone is logged out, send them
// to the account page and remember where they were trying to go.
export function requireUser(request, response) {
  if (request.user) return true;
  response.redirect(`/account?next=${encodeURIComponent(request.url)}&error=${encodeURIComponent("Please log in to create a report.")}`);
  return false;
}

// Formats dates for messages like "you can change your username again on..."
function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(value);
}

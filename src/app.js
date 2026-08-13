import http from "node:http";
import { config } from "./config.js";
import {
  createComment,
  createReport,
  deleteCommentForUser,
  deleteReportForUser,
  findPublicUserById,
  findReportForUser,
  findSurfSpotBySlug,
  findUserById,
  listCommentsForSpot,
  listRecentReports,
  listReportsForSpot,
  listReportsForUser,
  listSurfSpots,
  openDatabase,
  updateReportForUser,
  updateUserAvatar
} from "./db.js";
import { decorateResponse, deleteUploadedFile, readForm, readMultipartForm, readProfileImageForm, serveStatic } from "./httpUtils.js";
import { changeUsername, login, requireUser, resetPassword, signup, validateLogin, validateSignup } from "./auth.js";
import { destroySession, readSession, writeSession } from "./session.js";
import { aboutPage, accountPage, communityPage, editReportPage, errorPage, homePage, mapPage, notFoundPage, privacyPage, profilePage, reportFormPage, spotPage } from "./views.js";
import { validateReport } from "./validation.js";
import { getSpotConditions, placeholderConditions } from "./conditions.js";

// Builds the SurfSD HTTP server. Tests inject isolated database and upload paths.
export function createApp(options = {}) {
  openDatabase(options.databasePath || config.databasePath);
  const conditionsProvider = options.conditionsProvider || getSpotConditions;
  // An injectable upload path keeps automated test media separate from user uploads.
  const uploadDir = options.uploadDir || config.uploadDir;

  return http.createServer(async (request, response) => {
    // Add shortcuts like response.html() and response.redirect(), then add basic
    // safety settings for the browser.
    decorateResponse(response);
    addSecurityHeaders(response);

    try {
      const url = new URL(request.url, "http://localhost");

      // Check if the visitor is logged in. If yes, request.user becomes the
      // current user for the rest of this request.
      request.session = readSession(request);
      request.user = request.session.userId ? findUserById(request.session.userId) : undefined;
      response.notFound = () => response.html(notFoundPage({ user: request.user }), 404);

      // Search-engine and browser-support files.
      if (request.method === "GET" && url.pathname === "/robots.txt") {
        return response.text(buildRobotsText());
      }
      if (request.method === "GET" && url.pathname === "/sitemap.xml") {
        return response.text(buildSitemap(listSurfSpots()), "application/xml; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/llms.txt") {
        return response.text(buildLlmsText());
      }
      if (request.method === "GET" && url.pathname === "/favicon.ico") {
        return response.redirect("/surfsd-logo.png", 302);
      }

      // Only serve public files we expect, like CSS, JavaScript, images, and uploads.
      if (
        url.pathname.startsWith("/uploads/") ||
        url.pathname.startsWith("/spot-images/") ||
        url.pathname === "/styles.css" ||
        url.pathname === "/map.js" ||
        url.pathname === "/sd-map.svg" ||
        url.pathname === "/surfsd-logo.png"
      ) {
        if (serveStatic(request, response)) return;
      }

      // Public pages anyone can view.
      if (request.method === "GET" && url.pathname === "/") return response.html(homePage({ user: request.user, reports: listRecentReports(8) }));
      if (request.method === "GET" && url.pathname === "/about") return response.html(aboutPage({ user: request.user }));
      if (request.method === "GET" && url.pathname === "/privacy") return response.html(privacyPage({ user: request.user }));
      if (request.method === "GET" && url.pathname === "/community") return response.html(communityPage({ user: request.user, reports: listRecentReports(24) }));
      if (request.method === "GET" && url.pathname === "/map") {
        // The map has one general San Diego conditions box. We use a known spot
        // near the middle of the county as the reference point.
        const sanDiegoReferenceSpot = findSurfSpotBySlug("ocean-beach-jetty") || findSurfSpotBySlug("little-point-rockpile");
        const conditions = sanDiegoReferenceSpot
          ? await conditionsProvider(sanDiegoReferenceSpot).catch(() => placeholderConditions())
          : placeholderConditions();
        return response.html(mapPage({ user: request.user, conditions, recentReports: listRecentReports(20) }));
      }
      if (request.method === "GET" && url.pathname === "/account") {
        return response.html(accountPage({
          user: request.user,
          reports: request.user ? listReportsForUser(request.user.id) : [],
          error: url.searchParams.get("error") || "",
          message: url.searchParams.get("message") || "",
          next: url.searchParams.get("next") || ""
        }));
      }

      // Account actions and public profile pages.
      if (request.method === "POST" && url.pathname === "/signup") return await handleSignup(request, response);
      if (request.method === "POST" && url.pathname === "/login") return await handleLogin(request, response);
      if (request.method === "POST" && url.pathname === "/account/username") return await handleChangeUsername(request, response);
      if (request.method === "POST" && url.pathname === "/account/password") return await handleResetPassword(request, response);
      if (request.method === "POST" && url.pathname === "/account/avatar") return await handleUpdateAvatar(request, response, uploadDir);
      if (request.method === "POST" && url.pathname === "/account/avatar/remove") return handleRemoveAvatar(request, response, uploadDir);
      const profileMatch = url.pathname.match(/^\/users\/(\d+)$/);
      if (request.method === "GET" && profileMatch) return handleProfilePage(request, response, profileMatch[1]);
      // Report and comment actions use the number from the URL as the database ID.
      const editReportMatch = url.pathname.match(/^\/reports\/(\d+)\/edit$/);
      if (request.method === "GET" && editReportMatch) return handleEditReportPage(request, response, editReportMatch[1]);
      if (request.method === "POST" && editReportMatch) return await handleUpdateReport(request, response, editReportMatch[1]);
      const commentMatch = url.pathname.match(/^\/reports\/(\d+)\/comments$/);
      if (request.method === "POST" && commentMatch) return await handleCreateComment(request, response, commentMatch[1]);
      const deleteCommentMatch = url.pathname.match(/^\/comments\/(\d+)\/delete$/);
      if (request.method === "POST" && deleteCommentMatch) return await handleDeleteComment(request, response, deleteCommentMatch[1]);
      const deleteReportMatch = url.pathname.match(/^\/reports\/(\d+)\/delete$/);
      if (request.method === "POST" && deleteReportMatch) return handleDeleteReport(request, response, deleteReportMatch[1], uploadDir);
      if (request.method === "GET" && url.pathname === "/logout") {
        destroySession(request, response);
        return response.redirect("/account");
      }

      // Surf spot pages and their create-report forms.
      const spotMatch = url.pathname.match(/^\/spots\/([^/]+)$/);
      if (request.method === "GET" && spotMatch) return await handleSpotPage(request, response, spotMatch[1], conditionsProvider, url.searchParams.get("error") || "");

      const newReportMatch = url.pathname.match(/^\/spots\/([^/]+)\/reports\/new$/);
      if (request.method === "GET" && newReportMatch) return handleNewReport(request, response, newReportMatch[1]);

      const createReportMatch = url.pathname.match(/^\/spots\/([^/]+)\/reports$/);
      if (request.method === "POST" && createReportMatch) return await handleCreateReport(request, response, createReportMatch[1], uploadDir);

      response.notFound();
    } catch (error) {
      // If someone uploads a file that is too big, show a friendly error instead
      // of letting the app break.
      if (error.message === "Request body is too large.") {
        response.html(accountPage({ user: request.user, error: "Request body is too large." }), 413);
        return;
      }
      console.error("SurfSD request failed:", error);
      response.html(errorPage({ user: request.user }), 500);
    }
  });
}

// Saves a small profile photo for the logged-in account.
async function handleUpdateAvatar(request, response, uploadDir) {
  if (!requireUser(request, response)) return;
  let upload;
  try {
    upload = await readProfileImageForm(request, { uploadDir });
  } catch (error) {
    if (error.message === "Request body is too large.") {
      return response.redirect(`/account?error=${encodeURIComponent("Profile photo must be 5 MB or smaller.")}`);
    }
    throw error;
  }

  if (upload.errors.length) return response.redirect(`/account?error=${encodeURIComponent(upload.errors.join(" "))}`);
  if (!upload.file) return response.redirect(`/account?error=${encodeURIComponent("Choose a profile photo to upload.")}`);
  const oldAvatarUrl = request.user.avatarUrl;
  updateUserAvatar(request.user.id, upload.file.imageUrl);
  if (oldAvatarUrl !== upload.file.imageUrl) deleteUploadedFile(oldAvatarUrl, uploadDir);
  response.redirect("/account?message=Profile Photo Updated");
}

function handleRemoveAvatar(request, response, uploadDir) {
  if (!requireUser(request, response)) return;
  const oldAvatarUrl = request.user.avatarUrl;
  updateUserAvatar(request.user.id, null);
  deleteUploadedFile(oldAvatarUrl, uploadDir);
  response.redirect("/account?message=Profile Photo Removed");
}

function handleProfilePage(request, response, userId) {
  const profile = findPublicUserById(Number(userId));
  if (!profile) return response.notFound();
  response.html(profilePage({ user: request.user, profile, reports: listReportsForUser(profile.id) }));
}

// Creates a new account, then immediately logs that person in.
async function handleSignup(request, response) {
  const form = await readForm(request);
  const errors = validateSignup(form);
  if (errors.length) {
    return response.html(accountPage({ user: undefined, error: errors.join(" "), next: form.next || "" }), 422);
  }

  const result = signup(form);
  if (result.errors) {
    return response.html(accountPage({ user: undefined, error: result.errors.join(" "), next: form.next || "" }), 409);
  }

  writeSession(response, { userId: result.user.id });
  response.redirect(form.next || "/account");
}

// Logs someone in with either email or username.
async function handleLogin(request, response) {
  const form = await readForm(request);
  const errors = validateLogin(form);
  if (errors.length) {
    return response.html(accountPage({ user: undefined, error: errors.join(" "), next: form.next || "" }), 422);
  }

  const result = login(form);
  if (result.errors) {
    return response.html(accountPage({ user: undefined, error: result.errors.join(" "), next: form.next || "" }), 401);
  }

  writeSession(response, { userId: result.user.id });
  response.redirect(form.next || "/account");
}

// Lets logged-in users change their username. auth.js checks the once-every-14-
// days rule.
async function handleChangeUsername(request, response) {
  if (!requireUser(request, response)) return;
  const form = await readForm(request);
  const result = changeUsername(request.user, form);
  if (result.errors) {
    return response.redirect(`/account?error=${encodeURIComponent(result.errors.join(" "))}`);
  }
  response.redirect("/account?message=Username updated.");
}

// Lets logged-in users change their password after they type their current
// password correctly.
async function handleResetPassword(request, response) {
  if (!requireUser(request, response)) return;
  const form = await readForm(request);
  const result = resetPassword(request.user.id, form);
  if (result.errors) {
    return response.redirect(`/account?error=${encodeURIComponent(result.errors.join(" "))}`);
  }
  response.redirect("/account?message=Password updated.");
}

// Deletes a report only if the logged-in user owns it.
function handleDeleteReport(request, response, reportId, uploadDir) {
  if (!requireUser(request, response)) return;
  const report = findReportForUser(Number(reportId), request.user.id);
  if (!report) {
    return response.redirect("/account?error=Report could not be deleted.");
  }
  const deleted = deleteReportForUser(Number(reportId), request.user.id);
  if (!deleted) {
    return response.redirect("/account?error=Report could not be deleted.");
  }
  deleteUploadedFile(report.imageUrl, uploadDir);
  response.redirect("/account?message=Report Deleted");
}

// Shows the edit form, but only during the 3-hour edit window.
function handleEditReportPage(request, response, reportId) {
  if (!requireUser(request, response)) return;
  const report = findReportForUser(Number(reportId), request.user.id);
  if (!report) return response.redirect("/account?error=Report could not be found.");
  if (!canEditReport(report)) {
    return response.redirect("/account?error=Reports can only be edited within 3 hours.");
  }
  response.html(editReportPage({ user: request.user, report }));
}

// Saves an edited report. The database also checks ownership and the 3-hour
// window, so people cannot cheat by skipping the normal page.
async function handleUpdateReport(request, response, reportId) {
  if (!requireUser(request, response)) return;
  const report = findReportForUser(Number(reportId), request.user.id);
  if (!report) return response.redirect("/account?error=Report could not be found.");
  if (!canEditReport(report)) {
    return response.redirect("/account?error=Reports can only be edited within 3 hours.");
  }

  const form = await readForm(request);
  const validation = validateReport(form);
  if (validation.errors.length) {
    return response.html(editReportPage({
      user: request.user,
      report: { ...report, ...form },
      error: validation.errors.join(" ")
    }), 422);
  }

  const updated = updateReportForUser({
    reportId: Number(reportId),
    userId: request.user.id,
    description: validation.values.description,
    waveHeight: validation.values.waveHeight,
    rating: validation.values.rating
  });
  if (!updated) return response.redirect("/account?error=Reports can only be edited within 3 hours.");
  response.redirect("/account?message=Report Updated");
}

// Creates either a normal comment or a reply. The hidden "next" field sends the
// user back to the same spot page after posting.
async function handleCreateComment(request, response, reportId) {
  if (!requireUser(request, response)) return;
  const form = await readForm(request);
  const next = safeRedirectPath(form.next || "/map");
  const body = String(form.body || "").trim();
  const parentCommentId = form.parentCommentId ? Number(form.parentCommentId) : null;
  if (body.length < 2 || body.length > 180) {
    return response.redirect(`${next}?error=${encodeURIComponent("Comments must be between 2 and 180 characters.")}#report-${Number(reportId)}`);
  }
  const created = createComment({ reportId: Number(reportId), userId: request.user.id, body, parentCommentId });
  if (!created) return response.redirect(`${next}?error=${encodeURIComponent("Comment could not be posted.")}#report-${Number(reportId)}`);
  response.redirect(`${next}#report-${Number(reportId)}`);
}

// Deletes comments only for their owner. If an original comment is deleted, its
// replies are deleted too because they belong under it.
async function handleDeleteComment(request, response, commentId) {
  if (!requireUser(request, response)) return;
  const form = await readForm(request);
  const next = safeRedirectPath(form.next || "/map");
  const reportId = Number(form.reportId || 0);
  const deleted = deleteCommentForUser(Number(commentId), request.user.id);
  if (!deleted) return response.redirect(`${next}?error=${encodeURIComponent("Comment could not be deleted.")}#report-${reportId}`);
  response.redirect(`${next}#report-${reportId}`);
}

// Builds a surf spot page with spot info, live conditions, reports, and comments.
async function handleSpotPage(request, response, slug, conditionsProvider, error = "") {
  const spot = findSurfSpotBySlug(slug);
  if (!spot) return response.notFound();
  const reports = listReportsForSpot(spot.id);
  const comments = listCommentsForSpot(spot.id);

  // Put each comment under the correct report card.
  const commentsByReport = new Map();
  for (const comment of comments) {
    const reportComments = commentsByReport.get(comment.reportId) || [];
    reportComments.push(comment);
    commentsByReport.set(comment.reportId, reportComments);
  }
  for (const report of reports) {
    report.comments = commentsByReport.get(report.id) || [];
  }
  const conditions = await conditionsProvider(spot).catch(() => placeholderConditions());
  response.html(spotPage({ user: request.user, spot, reports, conditions, error }));
}

// Shows the blank create-report form for a specific surf spot.
function handleNewReport(request, response, slug) {
  if (!requireUser(request, response)) return;
  const spot = findSurfSpotBySlug(slug);
  if (!spot) return response.notFound();
  response.html(reportFormPage({ user: request.user, spot }));
}

// Reads the report form, checks the inputs, then saves the report.
async function handleCreateReport(request, response, slug, uploadDir) {
  if (!requireUser(request, response)) return;
  const spot = findSurfSpotBySlug(slug);
  if (!spot) return response.notFound();

  let upload;
  try {
    // This reads both the regular form fields and the optional video upload.
    upload = await readMultipartForm(request, { uploadDir });
  } catch (error) {
    if (error.message === "Request body is too large.") {
      return response.html(reportFormPage({
        user: request.user,
        spot,
        error: "Video must be 50 MB or smaller."
      }), 413);
    }
    throw error;
  }
  const validation = validateReport(upload.fields);
  const errors = [...upload.errors, ...validation.errors];
  if (errors.length) {
    // The file was written before the text fields were validated, so remove it
    // when the rest of the form is rejected.
    deleteUploadedFile(upload.file?.imageUrl, uploadDir);
    return response.html(reportFormPage({
      user: request.user,
      spot,
      error: errors.join(" "),
      values: upload.fields
    }), 422);
  }

  try {
    createReport({
      surfSpotId: spot.id,
      userId: request.user.id,
      imageUrl: upload.file?.imageUrl || null,
      description: validation.values.description,
      waveHeight: validation.values.waveHeight,
      rating: validation.values.rating
    });
  } catch (error) {
    deleteUploadedFile(upload.file?.imageUrl, uploadDir);
    throw error;
  }

  response.redirect(`/spots/${spot.slug}`);
}

// Adds browser safety rules, like blocking this site from being embedded inside
// another site.
function addSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' https://images.unsplash.com https://*.tile.openstreetmap.org data:; style-src 'self' https://unpkg.com 'unsafe-inline'; script-src 'self' https://unpkg.com; connect-src 'self';"
  );
}

function buildRobotsText() {
  return `User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /reports/\nSitemap: ${config.siteUrl}/sitemap.xml\n`;
}

function buildSitemap(spots) {
  const pages = ["/", "/map", "/community", "/about", "/privacy", ...spots.map((spot) => `/spots/${spot.slug}`)];
  const urls = pages.map((pathname) => `  <url><loc>${escapeXml(`${config.siteUrl}${pathname}`)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function buildLlmsText() {
  return `# SurfSD\n\nSurfSD is a community-driven San Diego surf reporting platform. Surfers can explore local breaks, review live conditions, publish firsthand reports, and discuss those reports.\n\n## Public Pages\n- ${config.siteUrl}/map — Live surf spot map and newest reports\n- ${config.siteUrl}/community — Community report feed\n- ${config.siteUrl}/about — About SurfSD\n- ${config.siteUrl}/privacy — Privacy information\n`;
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

// Reports are editable for 3 hours after creation.
function canEditReport(report) {
  return Date.now() - parseSqliteDate(report.createdAt).getTime() <= 3 * 60 * 60 * 1000;
}

// The database stores dates in a format JavaScript needs help reading. This
// converts them into a format JavaScript understands better.
function parseSqliteDate(value) {
  if (typeof value === "string" && !value.includes("T")) {
    return new Date(`${value.replace(" ", "T")}Z`);
  }
  return new Date(value);
}

// Only allow redirects to pages inside this app.
function safeRedirectPath(value) {
  const path = String(value || "");
  if (!path.startsWith("/") || path.startsWith("//")) return "/map";
  return path;
}

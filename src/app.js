import http from "node:http";
import { config } from "./config.js";
import { openDatabase, createComment, createReport, deleteCommentForUser, deleteReportForUser, findMostRecentReportForUser, findReportForUser, findSurfSpotBySlug, findUserById, listCommentsForSpot, listReportsForSpot, listReportsForUser, updateReportForUser } from "./db.js";
import { decorateResponse, readForm, readMultipartForm, serveStatic } from "./httpUtils.js";
import { changeUsername, login, requireUser, resetPassword, signup, validateLogin, validateSignup } from "./auth.js";
import { destroySession, readSession, writeSession } from "./session.js";
import { aboutPage, accountPage, editReportPage, mapPage, reportFormPage, spotPage } from "./views.js";
import { validateReport } from "./validation.js";
import { getSpotConditions, placeholderConditions } from "./conditions.js";

export function createApp(options = {}) {
  openDatabase(options.databasePath || config.databasePath);
  const conditionsProvider = options.conditionsProvider || getSpotConditions;

  return http.createServer(async (request, response) => {
    decorateResponse(response);
    addSecurityHeaders(response);

    try {
      const url = new URL(request.url, "http://localhost");
      request.session = readSession(request);
      request.user = request.session.userId ? findUserById(request.session.userId) : undefined;

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

      if (request.method === "GET" && url.pathname === "/") return response.redirect("/map");
      if (request.method === "GET" && url.pathname === "/about") return response.html(aboutPage({ user: request.user }));
      if (request.method === "GET" && url.pathname === "/map") {
        const sanDiegoReferenceSpot = findSurfSpotBySlug("ocean-beach-jetty") || findSurfSpotBySlug("little-point-rockpile");
        const conditions = sanDiegoReferenceSpot
          ? await conditionsProvider(sanDiegoReferenceSpot).catch(() => placeholderConditions())
          : placeholderConditions();
        return response.html(mapPage({ user: request.user, conditions }));
      }
      if (request.method === "GET" && url.pathname === "/account") {
        return response.html(accountPage({
          user: request.user,
          recentReport: request.user ? findMostRecentReportForUser(request.user.id) : undefined,
          reports: request.user ? listReportsForUser(request.user.id) : [],
          error: url.searchParams.get("error") || "",
          message: url.searchParams.get("message") || "",
          next: url.searchParams.get("next") || ""
        }));
      }

      if (request.method === "POST" && url.pathname === "/signup") return await handleSignup(request, response);
      if (request.method === "POST" && url.pathname === "/login") return await handleLogin(request, response);
      if (request.method === "POST" && url.pathname === "/account/username") return await handleChangeUsername(request, response);
      if (request.method === "POST" && url.pathname === "/account/password") return await handleResetPassword(request, response);
      const editReportMatch = url.pathname.match(/^\/reports\/(\d+)\/edit$/);
      if (request.method === "GET" && editReportMatch) return handleEditReportPage(request, response, editReportMatch[1]);
      if (request.method === "POST" && editReportMatch) return await handleUpdateReport(request, response, editReportMatch[1]);
      const commentMatch = url.pathname.match(/^\/reports\/(\d+)\/comments$/);
      if (request.method === "POST" && commentMatch) return await handleCreateComment(request, response, commentMatch[1]);
      const deleteCommentMatch = url.pathname.match(/^\/comments\/(\d+)\/delete$/);
      if (request.method === "POST" && deleteCommentMatch) return await handleDeleteComment(request, response, deleteCommentMatch[1]);
      const deleteReportMatch = url.pathname.match(/^\/reports\/(\d+)\/delete$/);
      if (request.method === "POST" && deleteReportMatch) return handleDeleteReport(request, response, deleteReportMatch[1]);
      if (request.method === "GET" && url.pathname === "/logout") {
        destroySession(request, response);
        return response.redirect("/account");
      }

      const spotMatch = url.pathname.match(/^\/spots\/([^/]+)$/);
      if (request.method === "GET" && spotMatch) return await handleSpotPage(request, response, spotMatch[1], conditionsProvider, url.searchParams.get("error") || "");

      const newReportMatch = url.pathname.match(/^\/spots\/([^/]+)\/reports\/new$/);
      if (request.method === "GET" && newReportMatch) return handleNewReport(request, response, newReportMatch[1]);

      const createReportMatch = url.pathname.match(/^\/spots\/([^/]+)\/reports$/);
      if (request.method === "POST" && createReportMatch) return await handleCreateReport(request, response, createReportMatch[1]);

      response.notFound();
    } catch (error) {
      if (error.message === "Request body is too large.") {
        response.html(accountPage({ user: request.user, error: "Request body is too large." }), 413);
        return;
      }
      response.html(`<h1>Something went wrong</h1><p>${error.message}</p>`, 500);
    }
  });
}

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

async function handleChangeUsername(request, response) {
  if (!requireUser(request, response)) return;
  const form = await readForm(request);
  const result = changeUsername(request.user, form);
  if (result.errors) {
    return response.redirect(`/account?error=${encodeURIComponent(result.errors.join(" "))}`);
  }
  response.redirect("/account?message=Username updated.");
}

async function handleResetPassword(request, response) {
  if (!requireUser(request, response)) return;
  const form = await readForm(request);
  const result = resetPassword(request.user.id, form);
  if (result.errors) {
    return response.redirect(`/account?error=${encodeURIComponent(result.errors.join(" "))}`);
  }
  response.redirect("/account?message=Password updated.");
}

function handleDeleteReport(request, response, reportId) {
  if (!requireUser(request, response)) return;
  const deleted = deleteReportForUser(Number(reportId), request.user.id);
  if (!deleted) {
    return response.redirect("/account?error=Report could not be deleted.");
  }
  response.redirect("/account?message=Report Deleted");
}

function handleEditReportPage(request, response, reportId) {
  if (!requireUser(request, response)) return;
  const report = findReportForUser(Number(reportId), request.user.id);
  if (!report) return response.redirect("/account?error=Report could not be found.");
  if (!canEditReport(report)) {
    return response.redirect("/account?error=Reports can only be edited within 3 hours.");
  }
  response.html(editReportPage({ user: request.user, report }));
}

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

async function handleDeleteComment(request, response, commentId) {
  if (!requireUser(request, response)) return;
  const form = await readForm(request);
  const next = safeRedirectPath(form.next || "/map");
  const reportId = Number(form.reportId || 0);
  const deleted = deleteCommentForUser(Number(commentId), request.user.id);
  if (!deleted) return response.redirect(`${next}?error=${encodeURIComponent("Comment could not be deleted.")}#report-${reportId}`);
  response.redirect(`${next}#report-${reportId}`);
}

async function handleSpotPage(request, response, slug, conditionsProvider, error = "") {
  const spot = findSurfSpotBySlug(slug);
  if (!spot) return response.notFound();
  const reports = listReportsForSpot(spot.id);
  const comments = listCommentsForSpot(spot.id);
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

function handleNewReport(request, response, slug) {
  if (!requireUser(request, response)) return;
  const spot = findSurfSpotBySlug(slug);
  if (!spot) return response.notFound();
  response.html(reportFormPage({ user: request.user, spot }));
}

async function handleCreateReport(request, response, slug) {
  if (!requireUser(request, response)) return;
  const spot = findSurfSpotBySlug(slug);
  if (!spot) return response.notFound();

  let upload;
  try {
    upload = await readMultipartForm(request);
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
  const validation = validateReport({ ...upload.fields, file: upload.file });
  const errors = [...upload.errors, ...validation.errors];
  if (errors.length) {
    return response.html(reportFormPage({
      user: request.user,
      spot,
      error: errors.join(" "),
      values: upload.fields
    }), 422);
  }

  createReport({
    surfSpotId: spot.id,
    userId: request.user.id,
    imageUrl: upload.file?.imageUrl || null,
    description: validation.values.description,
    waveHeight: validation.values.waveHeight,
    rating: validation.values.rating
  });

  response.redirect(`/spots/${spot.slug}`);
}

function addSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' https://images.unsplash.com https://*.tile.openstreetmap.org data:; style-src 'self' https://unpkg.com 'unsafe-inline'; script-src 'self' https://unpkg.com; connect-src 'self';"
  );
}

function canEditReport(report) {
  return Date.now() - parseSqliteDate(report.createdAt).getTime() <= 3 * 60 * 60 * 1000;
}

function parseSqliteDate(value) {
  if (typeof value === "string" && !value.includes("T")) {
    return new Date(`${value.replace(" ", "T")}Z`);
  }
  return new Date(value);
}

function safeRedirectPath(value) {
  const path = String(value || "");
  if (!path.startsWith("/") || path.startsWith("//")) return "/map";
  return path;
}

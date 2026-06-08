import http from "node:http";
import { config } from "./config.js";
import { openDatabase, findSurfSpotBySlug, findUserById, listReportsForSpot, createReport } from "./db.js";
import { decorateResponse, readForm, readMultipartForm, serveStatic } from "./httpUtils.js";
import { login, requireUser, signup, validateLogin, validateSignup } from "./auth.js";
import { destroySession, readSession, writeSession } from "./session.js";
import { aboutPage, accountPage, mapPage, reportFormPage, spotPage } from "./views.js";
import { validateReport } from "./validation.js";

export function createApp(options = {}) {
  openDatabase(options.databasePath || config.databasePath);

  return http.createServer(async (request, response) => {
    decorateResponse(response);
    addSecurityHeaders(response);

    try {
      const url = new URL(request.url, "http://localhost");
      request.session = readSession(request);
      request.user = request.session.userId ? findUserById(request.session.userId) : undefined;

      if (
        url.pathname.startsWith("/uploads/") ||
        url.pathname === "/styles.css" ||
        url.pathname === "/map.js" ||
        url.pathname === "/sd-map.svg" ||
        url.pathname === "/surfsd-logo.png"
      ) {
        if (serveStatic(request, response)) return;
      }

      if (request.method === "GET" && url.pathname === "/") return response.redirect("/map");
      if (request.method === "GET" && url.pathname === "/about") return response.html(aboutPage({ user: request.user }));
      if (request.method === "GET" && url.pathname === "/map") return response.html(mapPage({ user: request.user }));
      if (request.method === "GET" && url.pathname === "/account") {
        return response.html(accountPage({
          user: request.user,
          error: url.searchParams.get("error") || "",
          next: url.searchParams.get("next") || ""
        }));
      }

      if (request.method === "POST" && url.pathname === "/signup") return handleSignup(request, response);
      if (request.method === "POST" && url.pathname === "/login") return handleLogin(request, response);
      if (request.method === "GET" && url.pathname === "/logout") {
        destroySession(request, response);
        return response.redirect("/account");
      }

      const spotMatch = url.pathname.match(/^\/spots\/([^/]+)$/);
      if (request.method === "GET" && spotMatch) return handleSpotPage(request, response, spotMatch[1]);

      const newReportMatch = url.pathname.match(/^\/spots\/([^/]+)\/reports\/new$/);
      if (request.method === "GET" && newReportMatch) return handleNewReport(request, response, newReportMatch[1]);

      const createReportMatch = url.pathname.match(/^\/spots\/([^/]+)\/reports$/);
      if (request.method === "POST" && createReportMatch) return handleCreateReport(request, response, createReportMatch[1]);

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

function handleSpotPage(request, response, slug, error = "") {
  const spot = findSurfSpotBySlug(slug);
  if (!spot) return response.notFound();
  const reports = listReportsForSpot(spot.id);
  response.html(spotPage({ user: request.user, spot, reports, error }));
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

  const upload = await readMultipartForm(request);
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

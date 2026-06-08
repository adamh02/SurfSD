import { listSurfSpots } from "./db.js";

export function layout({ title, user, body, flash = "" }) {
  const navUser = user
    ? `<span class="nav-user">Hi, ${escapeHtml(user.name)}</span><a href="/logout">Log out</a>`
    : `<a href="/account">Log in</a>`;

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} | SurfSD</title>
    <link rel="stylesheet" href="/styles.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <script defer src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script defer src="/map.js"></script>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/map" aria-label="SurfSD map">
        <img src="/surfsd-logo.png" alt="SurfSD">
      </a>
      <nav>
        <a href="/map">Map</a>
        <a href="/about">About</a>
        <a href="/account">Account</a>
        ${navUser}
      </nav>
    </header>
    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ""}
    <main>${body}</main>
  </body>
  </html>`;
}

export function aboutPage(context) {
  return layout({
    ...context,
    title: "About",
    body: `<section class="page-band">
      <div class="content narrow">
        <h1>What is SurfSD?</h1>
        <p class="lead">SurfSD is a San Diego live updated surf report platform where local surfers can publish surf reports with ratings, wave height, and pictures/videos of how the surf is doing at any specific spot. This is an active ongoing project by a fellow San Diego surfer who wants to make local conditions more accessible, sometimes the live cameras or swell charts just don't cut it. In the future we plan to expand globally but for now this is a San Diego exclusive platform!</p>
        <img class="about-logo" src="/surfsd-logo.png" alt="SurfSD logo">
      </div>
    </section>`
  });
}

export function accountPage({ user, error = "", next = "" }) {
  const body = user
    ? `<section class="page-band"><div class="content narrow">
        <p class="eyebrow">Account</p>
        <h1>${escapeHtml(user.name)}</h1>
        <p class="lead">${escapeHtml(user.email)}</p>
        <p>Member since ${formatDate(user.createdAt)}.</p>
        <a class="button" href="/logout">Log out</a>
      </div></section>`
    : `<section class="auth-grid content">
        ${authForm("Sign up", "/signup", next, ["name", "email", "password"])}
        ${authForm("Log in", "/login", next, ["email", "password"])}
      </section>`;

  return layout({ title: "Account", user, flash: error, body });
}

function authForm(title, action, next, fields) {
  return `<form class="panel" method="post" action="${action}">
    <h1>${title}</h1>
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    ${fields.includes("name") ? `<label>Name<input name="name" autocomplete="name" required minlength="2"></label>` : ""}
    <label>Email<input name="email" type="email" autocomplete="email" required></label>
    <label>Password<input name="password" type="password" autocomplete="${title === "Sign up" ? "new-password" : "current-password"}" required minlength="8"></label>
    <button class="button" type="submit">${title}</button>
  </form>`;
}

export function mapPage(context) {
  const spots = listSurfSpots();
  const spotData = escapeHtml(JSON.stringify(spots.map(({ name, slug, latitude, longitude, difficulty }) => ({ name, slug, latitude, longitude, difficulty }))));
  return layout({
    ...context,
    title: "Map",
    body: `<section class="map-shell">
      <div class="map-copy">
        <p class="eyebrow">Live community map</p>
        <h1>San Diego surf spots</h1>
        <p>Explore placeholder spots from North County down to Ocean Beach, then open a spot page to read or post condition reports.</p>
      </div>
      <div id="surf-map" data-spots="${spotData}"></div>
      <aside class="stats-panel">
        <span>Today placeholder</span>
        <strong>3-4 ft W swell</strong>
        <p>Tide: mid rising<br>Wind: light W<br>Weather: 68 F, patchy marine layer</p>
      </aside>
    </section>`
  });
}

export function spotPage({ user, spot, reports, error = "" }) {
  return layout({
    title: spot.name,
    user,
    flash: error,
    body: `<section class="spot-hero">
      <img src="${escapeHtml(spot.imageUrl)}" alt="${escapeHtml(spot.name)} surf">
      <div class="spot-heading">
        <p class="eyebrow">${escapeHtml(spot.difficulty)}</p>
        <h1>${escapeHtml(spot.name)}</h1>
        <p>${escapeHtml(spot.description)}</p>
        <div class="condition-strip">
          <span><strong>Swell</strong> 3-4 ft W</span>
          <span><strong>Tide</strong> Mid rising</span>
          <span><strong>Weather</strong> 68 F</span>
        </div>
        <a class="button" href="/spots/${escapeHtml(spot.slug)}/reports/new">+ Create Report</a>
      </div>
    </section>
    <section class="content reports-section">
      <h2>Recent reports</h2>
      ${reports.length ? `<div class="report-grid">${reports.map(reportCard).join("")}</div>` : `<p class="empty">No reports yet. Be the first to share what you see.</p>`}
    </section>`
  });
}

function reportCard(report) {
  return `<article class="report-card">
    ${report.imageUrl ? `<img src="${escapeHtml(report.imageUrl)}" alt="Surf report photo">` : `<div class="report-photo-placeholder">No photo</div>`}
    <div>
      <p>${escapeHtml(report.description)}</p>
      <div class="meta">
        <span>${escapeHtml(report.waveHeight)} ft</span>
        ${report.rating ? `<span>${escapeHtml(report.rating)}/10</span>` : `<span>No rating</span>`}
        <span>${escapeHtml(formatDateTime(report.createdAt))}</span>
        <span>${escapeHtml(report.userName)}</span>
      </div>
    </div>
  </article>`;
}

export function reportFormPage({ user, spot, error = "", values = {} }) {
  return layout({
    title: `Create Report for ${spot.name}`,
    user,
    flash: error,
    body: `<section class="page-band"><form class="content narrow panel" method="post" enctype="multipart/form-data" action="/spots/${escapeHtml(spot.slug)}/reports">
      <p class="eyebrow">${escapeHtml(spot.name)}</p>
      <h1>Create surf report</h1>
      <label>Photo (Optional)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif"></label>
      <label>Description<textarea name="description" maxlength="280" required>${escapeHtml(values.description || "")}</textarea></label>
      <label>Wave Height (Feet)<input type="number" name="waveHeight" min="1" max="100" value="${escapeHtml(values.waveHeight || "")}" required></label>
      <label>Rating, 1-10 (Optional)<input type="number" name="rating" min="1" max="10" value="${escapeHtml(values.rating || "")}"></label>
      <button class="button" type="submit">Save report</button>
    </form></section>`
  });
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

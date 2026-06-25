import { listSurfSpots } from "./db.js";

export function layout({ title, user, body, flash = "" }) {
  const navUser = user
    ? `<a href="/logout">Log Out</a><span class="nav-user">Hi, ${escapeHtml(user.name)}</span>`
    : `<a href="/account">Log In</a>`;

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
    ${flash ? `<div class="flash" role="alert">${escapeHtml(flash)}</div>` : ""}
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
        <h1>What Is SurfSD?</h1>
        <p class="lead">SurfSD is a community driven surf reporting platform built specifically for San Diego surfers. The platform allows users to post real time surf reports, including wave ratings, estimated wave heights, photos, and videos from local surf spots across the county.</p>
        <p class="lead">The goal of SurfSD is to make current surf conditions more accessible through firsthand reports from the people actually in the water. While surf cams and swell forecasts are valuable tools, they don't always tell the full story. SurfSD bridges that gap by providing live, crowd sourced updates from local surfers.</p>
        <p class="lead">Currently focused exclusively on San Diego, SurfSD is an active and evolving project with plans to expand to surf communities around the world in the future.</p>
        <img class="about-logo" src="/surfsd-logo.png" alt="SurfSD logo">
      </div>
    </section>`
  });
}

export function accountPage({ user, recentReport, reports = [], error = "", message = "", next = "" }) {
  const body = user
    ? `<section class="page-band"><div class="content narrow">
        <p class="eyebrow">Account</p>
        <h1>Your Account</h1>
        <dl class="account-details">
          <div><dt>Username</dt><dd>${escapeHtml(user.name)}</dd></div>
          <div><dt>Email</dt><dd>${escapeHtml(user.email)}</dd></div>
          <div><dt>Member Since</dt><dd>${formatDate(user.createdAt)}</dd></div>
        </dl>
        <section class="account-settings">
          <div class="section-heading">
            <p class="eyebrow">Account Settings</p>
            <h2>Manage Your Account</h2>
          </div>
          <div class="settings-grid">
            <form class="settings-card" method="post" action="/account/username">
              <h3>Change Username</h3>
              <p>You can change your username once every 14 days.</p>
              <label>New Username<input name="name" autocomplete="username" minlength="2" maxlength="32" value="${escapeHtml(user.name)}" required></label>
              <button class="button" type="submit">Update Username</button>
            </form>
            <form class="settings-card" method="post" action="/account/password">
              <h3>Reset Password</h3>
              <p>Enter your current password before choosing a new one.</p>
              <label>Current Password<input name="currentPassword" type="password" autocomplete="current-password" placeholder="Current password" required></label>
              <label>New Password<input name="newPassword" type="password" autocomplete="new-password" placeholder="At least 8 characters" minlength="8" required></label>
              <button class="button" type="submit">Update Password</button>
            </form>
          </div>
        </section>
        <section class="account-history">
          <div class="section-heading">
            <p class="eyebrow">Report History</p>
            <h2>Your Reports</h2>
          </div>
          ${reports.length ? `<div class="history-list">${reports.map(accountReport).join("")}</div>` : `<p class="empty">No reports yet. Your saved surf reports will show up here.</p>`}
        </section>
        <a class="button" href="/logout">Log Out</a>
      </div></section>`
    : `<section class="auth-grid content">
        ${authForm("Sign Up", "/signup", next, ["name", "email", "password"])}
        ${authForm("Log In", "/login", next, ["email", "password"])}
      </section>`;

  return layout({ title: "Account", user, flash: error || message, body });
}

function authForm(title, action, next, fields) {
  const isLogin = title === "Log In";
  return `<form class="panel" method="post" action="${action}">
    <h1>${title}</h1>
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    ${fields.includes("name") ? `<label>Username<input name="name" autocomplete="username" placeholder="WaveRider" required minlength="2"></label>` : ""}
    <label>${isLogin ? "Email or Username" : "Email"}<input name="email" type="${isLogin ? "text" : "email"}" autocomplete="${isLogin ? "username" : "email"}" placeholder="${isLogin ? "surfer@example.com or WaveRider" : "surfer@example.com"}" required></label>
    <label>Password<input name="password" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" placeholder="At least 8 characters" required minlength="8"></label>
    <button class="button" type="submit">${title}</button>
  </form>`;
}

function accountReport(report) {
  return `<article class="history-item">
    <div>
      <a href="/spots/${escapeHtml(report.surfSpotSlug)}">${escapeHtml(report.surfSpotName)}</a>
      <p>${escapeHtml(report.description)}</p>
    </div>
    <dl>
      <div><dt>Wave Height</dt><dd>${escapeHtml(report.waveHeight)} ft</dd></div>
      <div><dt>Rating</dt><dd>${ratingSummary(report.rating)}</dd></div>
      <div><dt>Date</dt><dd>${escapeHtml(formatDate(report.createdAt))}</dd></div>
    </dl>
  </article>`;
}

export function mapPage(context) {
  const spots = listSurfSpots();
  const conditions = context.conditions || { swell: "Loading swell", tide: "Loading tide", weather: "Loading weather" };
  const liveTimestamp = formatLiveTimestamp(context.now);
  const spotData = escapeHtml(JSON.stringify(spots.map(({ name, slug, latitude, longitude, difficulty, hasReportToday }) => ({
    name,
    slug,
    latitude,
    longitude,
    difficulty,
    hasReportToday: Boolean(hasReportToday)
  }))));
  return layout({
    ...context,
    title: "Map",
    body: `<section class="map-shell">
      <div class="map-copy">
        <p class="eyebrow">San Diego beta</p>
        <h1>SurfSD</h1>
        <p>A live San Diego surf map for checking local breaks, current ocean conditions, and community reports from surfers nearby.</p>
        <div class="map-summary">
          <span><strong>${spots.length}</strong> Spots</span>
          <span><strong>Live</strong> Conditions</span>
        </div>
      </div>
      <div id="surf-map" data-spots="${spotData}"></div>
      <aside class="stats-panel">
        <span>Live San Diego report</span>
        <time datetime="${escapeHtml(toIsoTimestamp(context.now))}">${escapeHtml(liveTimestamp)}</time>
        <strong>${escapeHtml(conditions.swell)}</strong>
        <dl>
          <div><dt>Tide</dt><dd>${escapeHtml(conditions.tide)}</dd></div>
          <div><dt>Weather</dt><dd>${escapeHtml(conditions.weather)}</dd></div>
        </dl>
        <p class="source-note">Sources: NOAA NDBC, NOAA Tides & Currents, National Weather Service</p>
      </aside>
    </section>`
  });
}

export function spotPage({ user, spot, reports, conditions, error = "" }) {
  const now = new Date();
  const liveTimestamp = formatLiveTimestamp(now);
  const isoTimestamp = toIsoTimestamp(now);
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
          <span><strong>Swell</strong><time datetime="${escapeHtml(isoTimestamp)}">${escapeHtml(liveTimestamp)}</time><em>${escapeHtml(conditions.swell)}</em><small>NOAA NDBC</small></span>
          <span><strong>Tide</strong><time datetime="${escapeHtml(isoTimestamp)}">${escapeHtml(liveTimestamp)}</time><em>${escapeHtml(conditions.tide)}</em><small>NOAA Tides & Currents</small></span>
          <span><strong>Weather</strong><time datetime="${escapeHtml(isoTimestamp)}">${escapeHtml(liveTimestamp)}</time><em>${escapeHtml(conditions.weather)}</em><small>National Weather Service</small></span>
        </div>
        <a class="button" href="/spots/${escapeHtml(spot.slug)}/reports/new">+ Create Report</a>
      </div>
    </section>
    <section class="content reports-section">
      <h2>Recent Reports</h2>
      ${reports.length ? `<div class="report-grid">${reports.map(reportCard).join("")}</div>` : `<p class="empty">No reports yet. Be the first to share what you see.</p>`}
    </section>`
  });
}

function reportCard(report) {
  return `<article class="report-card">
    ${report.imageUrl ? reportMedia(report.imageUrl) : `<div class="report-media-placeholder">No video</div>`}
    <div>
      <p>${escapeHtml(report.description)}</p>
      <div class="meta">
        <span><strong>Wave Height</strong><em>${escapeHtml(report.waveHeight)} ft</em></span>
        <span><strong>Rating</strong><em>${ratingSummary(report.rating)}</em></span>
        <span><strong>Date</strong><em>${escapeHtml(formatRelativeTime(report.createdAt))}</em></span>
        <span><strong>Posted By</strong><em class="report-author">${escapeHtml(report.userName)}${reportBadge(report.userReportCount)}</em></span>
      </div>
    </div>
  </article>`;
}

function reportBadge(reportCount = 0) {
  const count = Number(reportCount);
  if (count >= 1000) return `<b class="report-badge report-badge-elite" title="1,000+ surf reports posted">1K Reports</b>`;
  if (count >= 100) return `<b class="report-badge report-badge-pro" title="100+ surf reports posted">100 Reports</b>`;
  if (count >= 10) return `<b class="report-badge" title="10+ surf reports posted">10 Reports</b>`;
  return "";
}

function reportMedia(mediaUrl) {
  const escapedUrl = escapeHtml(mediaUrl);
  if (/\.(mp4|webm|mov)$/i.test(mediaUrl)) {
    return `<video class="report-video" controls preload="metadata" src="${escapedUrl}"></video>`;
  }
  return `<img src="${escapedUrl}" alt="Surf report media">`;
}

function ratingSummary(rating) {
  if (!rating) return "No rating";
  return `${escapeHtml(rating)}/10 - ${ratingLabel(Number(rating))}`;
}

function ratingLabel(rating) {
  if (rating >= 9) return "Firing";
  if (rating === 8) return "Good";
  if (rating >= 6) return "Decent";
  if (rating >= 4) return "Mediocre";
  return "Poor";
}

export function reportFormPage({ user, spot, error = "", values = {} }) {
  return layout({
    title: `Create Report for ${spot.name}`,
    user,
    flash: error,
    body: `<section class="page-band report-page"><form class="content narrow panel report-form" method="post" enctype="multipart/form-data" action="/spots/${escapeHtml(spot.slug)}/reports">
      <p class="eyebrow">${escapeHtml(spot.name)}</p>
      <h1>Create Surf Report</h1>
      <label>Video (Optional)<span class="field-hint">Upload a short MP4, WebM, or MOV clip of the current conditions.</span><input type="file" name="video" accept="video/mp4,video/webm,video/quicktime"></label>
      <label>Description<span class="field-hint">Tell surfers what you are seeing from the beach.</span><textarea name="description" maxlength="280" placeholder="Example: 3-4 ft and clean with a light offshore breeze. Best sets are lining up near the south peak." required>${escapeHtml(values.description || "")}</textarea></label>
      <label>Wave Height (Feet)<span class="field-hint">Enter the average face height you are seeing.</span><input type="number" name="waveHeight" min="1" max="100" placeholder="4" value="${escapeHtml(values.waveHeight || "")}" required></label>
      <label>Rating, 1-10 (Optional)<span class="field-hint">Use 1 for poor conditions and 10 for excellent conditions.</span><input type="number" name="rating" min="1" max="10" placeholder="7" value="${escapeHtml(values.rating || "")}"></label>
      <button class="button" type="submit">Save Report</button>
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

function formatLiveTimestamp(value = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short"
  }).format(new Date(value));
}

function toIsoTimestamp(value = new Date()) {
  return new Date(value).toISOString();
}

function formatRelativeTime(value) {
  const date = parseSqliteDate(value);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return formatDate(value);
}

function parseSqliteDate(value) {
  if (typeof value === "string" && !value.includes("T")) {
    return new Date(`${value.replace(" ", "T")}Z`);
  }
  return new Date(value);
}

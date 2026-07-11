import { listSurfSpots } from "./db.js";

// Shared wrapper for every page. The side drawer replaces the old row of menu
// links while keeping the same destinations and account behavior.
export function layout({
  title,
  user,
  body,
  flash = "",
  active = "home",
  includeMap = false
}) {
  const accountContent = user
    ? `<a class="drawer-profile" href="/users/${escapeHtml(user.id)}">
        ${avatarMarkup(user, "drawer-avatar")}
        <span><strong>${escapeHtml(user.name)}</strong><small>${formatCount(user.reportCount, "Report")} · ${formatCount(user.commentCount, "Comment")}</small></span>
        <b>View</b>
      </a>
      <a class="drawer-logout" href="/logout">Log Out</a>`
    : `<a class="drawer-login" href="/account">Log In or Sign Up</a>`;

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(title)} | SurfSD</title>
    <link rel="stylesheet" href="/styles.css">
    ${includeMap ? `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><script defer src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>` : ""}
    <script defer src="/map.js"></script>
  </head>
  <body>
    <header class="topbar">
      <button class="icon-button menu-button" type="button" aria-label="Open Menu" data-menu-open>
        <span class="menu-lines"><span></span></span>
      </button>
      ${brandMarkup()}
      <div class="topbar-actions">
        ${user ? `<a class="topbar-avatar-link" href="/account" aria-label="Open Your Account">${avatarMarkup(user, "topbar-avatar")}</a>` : `<a class="topbar-login" href="/account">Log In</a>`}
      </div>
    </header>

    <button class="drawer-scrim" type="button" aria-label="Close Menu" data-menu-close></button>
    <aside class="side-drawer" aria-label="Main Menu" aria-hidden="true" data-drawer>
      <div class="drawer-head">
        ${brandMarkup("drawer-brand")}
        <button class="icon-button drawer-close" type="button" aria-label="Close Menu" data-menu-close><span class="close-icon"></span></button>
      </div>
      <p class="drawer-kicker">Explore</p>
      <nav class="drawer-nav" aria-label="Main Navigation">
        ${drawerLink("home", "/", "⌂", "Home", active)}
        ${drawerLink("map", "/map", "⌖", "Live Map", active)}
        ${drawerLink("community", "/community", "◌", "Feed", active)}
        ${drawerLink("about", "/about", "≈", "About", active)}
        ${drawerLink("account", "/account", "◎", "Your Account", active)}
      </nav>
      <div class="drawer-spacer"></div>
      <div class="drawer-note">
        <strong>San Diego Beta</strong>
        <p>Real reports from surfers across the San Diego coast.</p>
      </div>
      ${accountContent}
    </aside>

    ${flash ? `<div class="flash" role="alert">${escapeHtml(flash)}</div>` : ""}
    <main>${body}</main>
  </body>
  </html>`;
}

function brandMarkup(extraClass = "") {
  return `<a class="brand-wordmark ${extraClass}" href="/" aria-label="SurfSD Home">
    <span class="brand-logo-frame"><img src="/surfsd-logo.png" alt=""></span>
    <span>SurfSD</span>
  </a>`;
}

function drawerLink(key, href, icon, label, active) {
  return `<a class="${active === key ? "is-active" : ""}" href="${href}"><span class="nav-icon">${icon}</span><span>${label}</span></a>`;
}

// Eye-catching landing page built around a real recent community report.
export function homePage({ user, reports = [] }) {
  const featured = reports[0];
  return layout({
    title: "Community Surf Reports",
    user,
    active: "home",
    body: `<section class="home-hero">
      <div class="hero-copy">
        <h1>Know Before You Paddle Out.</h1>
        <p class="hero-lead">Open the live map for firsthand reports, ratings, clips, and conversations from surfers already at the break.</p>
        <div class="hero-actions">
          <a class="primary-button" href="/map">Open the Live Map <span>→</span></a>
          <a class="ghost-button" href="/community">See Today’s Reports</a>
        </div>
      </div>
      <div class="hero-report">${featured ? homeFeaturedReport(featured) : homeEmptyReport()}</div>
      ${reports.length ? `<div class="coast-pulse"><span>Fresh Along the Coast</span><div class="pulse-track">${reports.slice(0, 4).map(pulseItem).join("")}</div></div>` : ""}
    </section>`
  });
}

function homeFeaturedReport(report) {
  return `<article class="floating-report">
    <a class="floating-report-media" href="/spots/${escapeHtml(report.surfSpotSlug)}#report-${escapeHtml(report.id)}" style="background-image:linear-gradient(0deg,rgba(4,25,31,.58),transparent 60%),url('${escapeHtml(report.surfSpotImageUrl)}')">
      <span class="fresh-flag">${escapeHtml(formatRelativeTime(report.createdAt))}</span>
      <span class="floating-location"><strong>${escapeHtml(report.surfSpotName)}</strong><small>${escapeHtml(report.surfSpotDifficulty)}</small></span>
    </a>
    <div class="floating-report-body">
      <div class="report-user-row">${profileAvatarLink(report)}<span><a href="/users/${escapeHtml(report.userId)}">${escapeHtml(report.userName)}</a><small>Community Contributor</small></span>${reportBadge(report.userReportCount)}</div>
      <p>“${escapeHtml(report.description)}”</p>
      <div class="quick-metrics">
        <span><small>Wave Height</small><strong>${escapeHtml(report.waveHeight)} ft</strong></span>
        <span><small>Rating</small><strong>${ratingSummary(report.rating)}</strong></span>
        <span><small>Conversation</small><strong>${formatCount(report.commentCount, "Comment")}</strong></span>
      </div>
      <div class="report-engagement"><span>Posted ${escapeHtml(formatRelativeTime(report.createdAt))}</span>${report.editedAt ? `<span>Edited</span>` : ""}</div>
    </div>
  </article>`;
}

function homeEmptyReport() {
  return `<article class="floating-report empty-featured-report"><div><p class="eyebrow">No Reports Yet</p><h2>Be the First Voice on the Coast.</h2><p>Choose a spot on the map and share what you see.</p><a class="primary-button" href="/map">Choose a Spot</a></div></article>`;
}

function pulseItem(report) {
  return `<a class="pulse-item" href="/spots/${escapeHtml(report.surfSpotSlug)}#report-${escapeHtml(report.id)}"><strong>${escapeHtml(report.surfSpotName)}</strong><span>${escapeHtml(report.waveHeight)} ft · ${escapeHtml(formatRelativeTime(report.createdAt))}</span></a>`;
}

// Map page with the real Leaflet map and a live community-report rail.
export function mapPage({ user, conditions, recentReports = [], now = new Date() }) {
  const spots = listSurfSpots();
  const liveConditions = conditions || { swell: "Conditions Unavailable", tide: "Conditions Unavailable", weather: "Conditions Unavailable" };
  const liveTimestamp = formatLiveTimestamp(now);
  const spotData = escapeHtml(JSON.stringify(spots.map(({ id, name, slug, latitude, longitude, hasReportToday }) => ({
    id,
    name,
    slug,
    latitude,
    longitude,
    hasReportToday: Boolean(hasReportToday)
  }))));

  return layout({
    title: "Live Map",
    user,
    active: "map",
    includeMap: true,
    body: `<section class="map-workspace">
      <div class="map-canvas-shell">
        <div class="map-toolbar">
          <label class="map-search"><span class="search-icon" aria-hidden="true"></span><input type="search" placeholder="Search Surf Spots" data-map-search></label>
        </div>
        <div id="surf-map" data-spots="${spotData}"></div>
        <aside class="map-source-note"><strong>Live San Diego Report</strong><time datetime="${escapeHtml(toIsoTimestamp(now))}">${escapeHtml(liveTimestamp)}</time><span>${escapeHtml(liveConditions.weather)}</span><small>NOAA NDBC · NOAA Tides & Currents · National Weather Service</small></aside>
      </div>
      <aside class="map-feed">
        <div class="feed-heading"><h1>Latest Reports</h1><span>Updated Now</span></div>
        <div class="filter-row" aria-label="Report Filters"><button class="is-active" type="button" data-map-filter="all">All Coast</button><button type="button" data-map-filter="north">North</button><button type="button" data-map-filter="central">Central</button><button type="button" data-map-filter="south">South</button></div>
        ${recentReports.length ? `<div class="feed-list">${recentReports.map(mapFeedCard).join("")}</div>` : `<div class="empty-feed"><h2>No Fresh Reports Yet</h2><p>Choose a marker and be the first to share today’s conditions.</p></div>`}
      </aside>
    </section>`
  });
}

function mapFeedCard(report) {
  return `<a class="feed-card" href="/spots/${escapeHtml(report.surfSpotSlug)}#report-${escapeHtml(report.id)}" data-report-region="${regionForLatitude(report.surfSpotLatitude)}">
    <span class="feed-card-photo" style="background-image:url('${escapeHtml(report.surfSpotImageUrl)}')"><span class="fresh-flag">${escapeHtml(formatRelativeTime(report.createdAt))}</span></span>
    <span class="feed-card-content"><span class="feed-card-head"><strong>${escapeHtml(report.surfSpotName)}</strong><small>by ${escapeHtml(report.userName)}</small></span><span class="feed-description">${escapeHtml(report.description)}</span><span class="feed-metrics"><b>${escapeHtml(report.waveHeight)} ft</b><b>${ratingSummary(report.rating)}</b><b>${formatCount(report.commentCount, "Comment")}</b></span></span>
  </a>`;
}

// Community page collects recent reports from every break into one useful feed.
export function communityPage({ user, reports = [] }) {
  return layout({
    title: "Feed",
    user,
    active: "community",
    body: `<section class="page-shell community-page">
      <div class="section-title"><div><h1>Latest Surf Reports.</h1></div></div>
      ${reports.length ? `<div class="dispatch-grid">${reports.map(communityCard).join("")}</div>` : `<section class="community-empty"><h2>No Community Reports Yet</h2><p>The map is ready. The first report can be yours.</p><a class="primary-button" href="/map">Open the Live Map</a></section>`}
      <section class="community-cta"><h2>Ready to Add Yours?</h2><a class="primary-button" href="/map">Create Report →</a></section>
    </section>`
  });
}

function communityCard(report, index) {
  const size = index % 5 === 0 ? "large" : index % 3 === 0 ? "small" : "medium";
  return `<article class="dispatch-card ${size}">
    <a class="dispatch-photo" href="/spots/${escapeHtml(report.surfSpotSlug)}#report-${escapeHtml(report.id)}" style="background-image:linear-gradient(0deg,rgba(4,25,31,.6),transparent 62%),url('${escapeHtml(report.surfSpotImageUrl)}')"><span class="fresh-flag">${escapeHtml(formatRelativeTime(report.createdAt))}</span><span><strong>${escapeHtml(report.surfSpotName)}</strong><small>${escapeHtml(report.surfSpotDifficulty)} · ${escapeHtml(report.waveHeight)} ft</small></span></a>
    <div class="dispatch-body"><div class="dispatch-author">${profileAvatarLink(report)}<span><a href="/users/${escapeHtml(report.userId)}">${escapeHtml(report.userName)}</a><small>${formatCount(report.userReportCount, "Report")}</small></span>${reportBadge(report.userReportCount)}</div><p>“${escapeHtml(report.description)}”</p><div class="dispatch-meta"><span>${ratingSummary(report.rating)}</span><span>${formatCount(report.commentCount, "Comment")}</span></div></div>
  </article>`;
}

// About remains in the main menu and explains the original purpose of SurfSD.
export function aboutPage({ user }) {
  return layout({
    title: "About",
    user,
    active: "about",
    body: `<section class="simple-about page-shell">
      <div class="simple-about-copy"><p class="eyebrow">About SurfSD</p><h1>What Is SurfSD?</h1><p>SurfSD is a community driven surf reporting platform built specifically for San Diego surfers. The platform allows users to post real time surf reports, including wave ratings, estimated wave heights, photos, and videos from local surf spots across the county.</p><p>The goal of SurfSD is to make current surf conditions more accessible through firsthand reports from the people actually in the water. While surf cams and swell forecasts are valuable tools, they don't always tell the full story. SurfSD bridges that gap by providing live, crowd sourced updates from local surfers.</p><p>Currently focused exclusively on San Diego, SurfSD is an active and evolving project with plans to expand to surf communities around the world in the future.</p></div>
      <img class="simple-about-logo" src="/surfsd-logo.png" alt="SurfSD Original Logo">
    </section>`
  });
}

// Private account page: profile photo, totals, settings, and report management.
export function accountPage({ user, reports = [], error = "", message = "", next = "" }) {
  if (!user) {
    return layout({
      title: "Account",
      user,
      active: "account",
      flash: error || message,
      body: `<section class="auth-page page-shell"><div class="auth-intro"><p class="eyebrow">Join the Community</p><h1>Join the SurfSD Community.</h1><p>Create an account to post reports, ask questions, reply to surfers, and build your local profile.</p></div><div class="auth-grid">${authForm("Sign Up", "/signup", next, ["name", "email", "password"])}${authForm("Log In", "/login", next, ["email", "password"])}</div></section>`
    });
  }

  return layout({
    title: "Your Account",
    user,
    active: "account",
    flash: error || message,
    body: `<section class="page-shell account-page">
      <div class="account-title"><p class="eyebrow">Your Corner of the Coast</p><h1>Your Account.</h1></div>
      <div class="account-dashboard">
        <aside class="profile-card">
          ${avatarMarkup(user, "profile-avatar")}
          <h2>${escapeHtml(user.name)}</h2><span>Member Since ${escapeHtml(formatDate(user.createdAt))}</span>
          <dl class="private-account-details"><div><dt>Username</dt><dd>${escapeHtml(user.name)}</dd></div><div><dt>Email</dt><dd>${escapeHtml(user.email)}</dd></div></dl>
          <div class="profile-stats"><div><span>Reports</span><strong>${escapeHtml(user.reportCount || 0)}</strong></div><div><span>Comments</span><strong>${escapeHtml(user.commentCount || 0)}</strong></div></div>
          <div class="badge-progress"><span>Community Badge</span><strong>${escapeHtml(profileBadgeProgress(user.reportCount))}</strong><div class="progress-track"><span style="width:${profileBadgePercent(user.reportCount)}%"></span></div></div>
          <a class="ghost-button full-button" href="/users/${escapeHtml(user.id)}">View Public Profile</a>
        </aside>
        <div class="account-main">
          <section class="account-panel">
            <div class="account-panel-head"><div><p class="eyebrow">Profile Photo</p><h2>Make Your Reports Recognizable.</h2></div></div>
            <div class="avatar-settings"><form method="post" action="/account/avatar" enctype="multipart/form-data"><label>Choose Profile Photo<span>PNG, JPG, or WebP · 5 MB maximum</span><input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" required></label><button class="primary-button" type="submit">Update Profile Photo</button></form>${user.avatarUrl ? `<form method="post" action="/account/avatar/remove" data-confirm="Are you sure you want to remove your profile photo?"><button class="text-danger-button" type="submit">Remove Profile Photo</button></form>` : ""}</div>
          </section>
          <section class="account-panel account-settings">
            <div class="account-panel-head"><div><p class="eyebrow">Account Settings</p><h2>Manage Your Account.</h2></div></div>
            <div class="settings-grid">
              <form class="settings-card" method="post" action="/account/username"><h3>Change Username</h3><p>You can change your username once every 14 days.</p><label>New Username<input name="name" autocomplete="username" minlength="2" maxlength="32" value="${escapeHtml(user.name)}" required></label><button class="secondary-button" type="submit">Update Username</button></form>
              <form class="settings-card" method="post" action="/account/password"><h3>Reset Password</h3><p>Enter your current password before choosing a new one.</p><label>Current Password<input name="currentPassword" type="password" autocomplete="current-password" placeholder="Current Password" required></label><label>New Password<input name="newPassword" type="password" autocomplete="new-password" placeholder="At Least 8 Characters" minlength="8" required></label><button class="secondary-button" type="submit">Update Password</button></form>
            </div>
          </section>
          <section class="account-panel account-history"><div class="account-panel-head"><div><p class="eyebrow">Report History</p><h2>Your Reports.</h2></div></div>${reports.length ? `<div class="history-list">${reports.map(accountReport).join("")}</div>` : `<p class="empty">No reports yet. Your saved surf reports will show up here.</p>`}</section>
        </div>
      </div>
    </section>`
  });
}

// Public profile page keeps email and account settings private.
export function profilePage({ user, profile, reports = [] }) {
  return layout({
    title: `${profile.name} Profile`,
    user,
    active: "community",
    body: `<section class="page-shell public-profile-page">
      <div class="public-profile-hero">${avatarMarkup(profile, "public-profile-avatar")}<div><p class="eyebrow">SurfSD Community Profile</p><h1>${escapeHtml(profile.name)}</h1><p>Member Since ${escapeHtml(formatDate(profile.createdAt))}</p></div>${user?.id === profile.id ? `<a class="secondary-button" href="/account">Edit Your Account</a>` : ""}</div>
      <div class="public-profile-stats"><div><span>Reports</span><strong>${escapeHtml(profile.reportCount || 0)}</strong></div><div><span>Comments</span><strong>${escapeHtml(profile.commentCount || 0)}</strong></div><div><span>Badge</span><strong>${escapeHtml(profileBadgeName(profile.reportCount))}</strong></div></div>
      <section class="profile-report-history"><div class="section-heading-row"><div><p class="eyebrow">Report History</p><h2>Reports by ${escapeHtml(profile.name)}.</h2></div><span>${formatCount(reports.length, "Report")}</span></div>${reports.length ? `<div class="history-list public-history-list">${reports.map(publicProfileReport).join("")}</div>` : `<p class="empty">No reports yet.</p>`}</section>
    </section>`
  });
}

function authForm(title, action, next, fields) {
  const isLogin = title === "Log In";
  return `<form class="auth-panel" method="post" action="${action}"><h2>${title}</h2><input type="hidden" name="next" value="${escapeHtml(next)}">${fields.includes("name") ? `<label>Username<input name="name" autocomplete="username" placeholder="WaveRider" required minlength="2"></label>` : ""}<label>${isLogin ? "Email or Username" : "Email"}<input name="email" type="${isLogin ? "text" : "email"}" autocomplete="${isLogin ? "username" : "email"}" placeholder="${isLogin ? "surfer@example.com or WaveRider" : "surfer@example.com"}" required></label><label>Password<span class="password-field"><input name="password" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" placeholder="At Least 8 Characters" required minlength="8"${isLogin ? " data-password-toggle-input" : ""}>${isLogin ? `<button class="password-toggle" type="button" data-password-toggle aria-label="Show password" aria-pressed="false">Show</button>` : ""}</span></label><button class="primary-button" type="submit">${title}</button></form>`;
}

function accountReport(report) {
  return `<article class="history-item"><span class="history-thumb" style="background-image:url('${escapeHtml(report.surfSpotImageUrl)}')"></span><div class="history-copy"><a href="/spots/${escapeHtml(report.surfSpotSlug)}#report-${escapeHtml(report.id)}">${escapeHtml(report.surfSpotName)}</a><p>${escapeHtml(report.description)}</p><div class="history-actions">${canEditReport(report) ? `<a class="text-action-link" href="/reports/${escapeHtml(report.id)}/edit">Edit Report</a>` : ""}<form method="post" action="/reports/${escapeHtml(report.id)}/delete" data-confirm="Are you sure you want to delete this surf report?"><button class="text-danger-button" type="submit">Delete Report</button></form></div></div><dl><div><dt>Wave Height</dt><dd>${escapeHtml(report.waveHeight)} ft</dd></div><div><dt>Rating</dt><dd>${ratingSummary(report.rating)}</dd></div><div><dt>Date</dt><dd>${escapeHtml(formatDate(report.createdAt))}</dd></div></dl></article>`;
}

function publicProfileReport(report) {
  return `<a class="public-history-item" href="/spots/${escapeHtml(report.surfSpotSlug)}#report-${escapeHtml(report.id)}"><span class="history-thumb" style="background-image:url('${escapeHtml(report.surfSpotImageUrl)}')"></span><span><strong>${escapeHtml(report.surfSpotName)}</strong><small>${escapeHtml(report.description)}</small></span><b>${escapeHtml(report.waveHeight)} ft</b><b>${ratingSummary(report.rating)}</b><b>${escapeHtml(formatDate(report.createdAt))}</b></a>`;
}

// Spot detail page keeps conditions, reports, replies, editing, and deleting.
export function spotPage({ user, spot, reports, conditions, error = "" }) {
  const now = new Date();
  const liveTimestamp = formatLiveTimestamp(now);
  const isoTimestamp = toIsoTimestamp(now);
  return layout({
    title: spot.name,
    user,
    active: "map",
    flash: error,
    body: `<section class="spot-cover" style="background-image:linear-gradient(0deg,rgba(4,25,31,.94),rgba(4,25,31,.12) 70%),url('${escapeHtml(spot.imageUrl)}')"><div class="spot-cover-inner"><div class="spot-identity"><p class="eyebrow light">${escapeHtml(spot.difficulty)} · San Diego</p><h1>${escapeHtml(spot.name)}</h1><p>${escapeHtml(spot.description)}</p></div><span class="spot-freshness"><span></span>${reports.length ? `${formatCount(reports.length, "Recent Report")}` : "No Recent Reports"}</span></div></section>
      <div class="spot-content">
        <section class="conditions-deck" aria-label="Live ${escapeHtml(spot.name)} Conditions"><div class="condition-cell"><span>Swell</span><strong>${escapeHtml(conditions.swell)}</strong><small><time datetime="${escapeHtml(isoTimestamp)}">${escapeHtml(liveTimestamp)}</time> · NOAA NDBC</small></div><div class="condition-cell"><span>Tide</span><strong>${escapeHtml(conditions.tide)}</strong><small><time datetime="${escapeHtml(isoTimestamp)}">${escapeHtml(liveTimestamp)}</time> · NOAA Tides & Currents</small></div><div class="condition-cell"><span>Weather</span><strong>${escapeHtml(conditions.weather)}</strong><small><time datetime="${escapeHtml(isoTimestamp)}">${escapeHtml(liveTimestamp)}</time> · National Weather Service</small></div><div class="condition-cell action-cell"><a class="primary-button" href="/spots/${escapeHtml(spot.slug)}/reports/new">＋ Create Report</a></div></section>
        <div class="spot-feed-layout"><section><div class="section-heading-row"><h2>Recent Reports</h2></div>${reports.length ? `<div class="community-report-list">${reports.map((report) => reportCard(report, { user, spot })).join("")}</div>` : `<div class="empty-report-state"><h3>No Reports Yet</h3><p>Be the first to share what you see.</p><a class="primary-button" href="/spots/${escapeHtml(spot.slug)}/reports/new">Create the First Report</a></div>`}</section></div>
      </div>`
  });
}

function reportCard(report, { user, spot }) {
  return `<article class="community-report-card" id="report-${escapeHtml(report.id)}">
    <div class="community-report-media">${report.imageUrl ? reportMedia(report.imageUrl) : `<div class="report-media-placeholder" style="background-image:linear-gradient(0deg,rgba(4,25,31,.55),transparent 60%),url('${escapeHtml(spot.imageUrl)}')"><span>No video</span></div>`}${report.rating ? `<span class="rating-stamp">${escapeHtml(report.rating)}/10<small>${escapeHtml(ratingLabel(Number(report.rating)))}</small></span>` : ""}</div>
    <div class="community-report-body"><div class="community-author">${profileAvatarLink(report)}<span><a href="/users/${escapeHtml(report.userId)}">${escapeHtml(report.userName)}</a><small>${formatCount(report.userReportCount, "Report")}</small></span>${reportBadge(report.userReportCount)}</div><p>“${escapeHtml(report.description)}” ${report.editedAt ? `<span class="edited-label">Edited</span>` : ""}</p><div class="report-data-line"><span><small>Wave Height</small><strong>${escapeHtml(report.waveHeight)} ft</strong></span><span><small>Rating</small><strong>${ratingSummary(report.rating)}</strong></span><span><small>Posted</small><strong>${escapeHtml(formatRelativeTime(report.createdAt))}</strong></span></div>${user?.id === report.userId ? `<div class="report-owner-actions">${canEditReport(report) ? `<a href="/reports/${escapeHtml(report.id)}/edit">Edit Report</a>` : ""}<form method="post" action="/reports/${escapeHtml(report.id)}/delete" data-confirm="Are you sure you want to delete this surf report?"><button type="submit">Delete Report</button></form></div>` : ""}${reportComments(report, { user, spot })}</div>
  </article>`;
}

function reportComments(report, { user, spot }) {
  const comments = report.comments || [];
  const topLevelComments = comments.filter((comment) => !comment.parentCommentId);
  const summaryText = comments.length === 1 ? "1 Comment" : `${comments.length} Comments`;
  return `<details class="report-comments"><summary><span class="comment-summary-main"><span class="comment-summary-icon" aria-hidden="true"></span><span><strong>Comments</strong><small>${summaryText}</small></span></span></summary>${topLevelComments.length ? `<div class="comment-list">${topLevelComments.map((comment) => commentThread(comment, comments, report, spot, user)).join("")}</div>` : `<p class="no-comments">No comments yet.</p>`}${user ? commentForm(report, spot) : `<p class="comment-login"><a href="/account?next=${encodeURIComponent(`/spots/${spot.slug}`)}">Log In</a> to comment.</p>`}</details>`;
}

function commentForm(report, spot, parentCommentId = "") {
  return `<form class="comment-form" method="post" action="/reports/${escapeHtml(report.id)}/comments"><input type="hidden" name="next" value="/spots/${escapeHtml(spot.slug)}">${parentCommentId ? `<input type="hidden" name="parentCommentId" value="${escapeHtml(parentCommentId)}">` : ""}<label>${parentCommentId ? "Reply" : "Comment"}<textarea name="body" maxlength="180" placeholder="${parentCommentId ? "Reply to This Comment..." : "Add a Helpful Note..."}" required></textarea></label><button class="secondary-button small-button" type="submit">${parentCommentId ? "Post Reply" : "Post Comment"}</button></form>`;
}

function commentThread(comment, allComments, report, spot, user) {
  const replies = allComments.filter((reply) => Number(reply.parentCommentId) === Number(comment.id));
  return `<article class="comment" id="comment-${escapeHtml(comment.id)}">${commentBody(comment, report, spot, user)}${user ? `<button class="reply-toggle" type="button" data-reply-toggle>Reply</button><div class="reply-form-shell" hidden>${commentForm(report, spot, comment.id)}</div>` : ""}${replies.length ? `<div class="comment-replies">${replies.map((reply) => `<article class="comment reply-comment" id="comment-${escapeHtml(reply.id)}">${commentBody(reply, report, spot, user)}</article>`).join("")}</div>` : ""}</article>`;
}

function commentBody(comment, report, spot, user) {
  return `<div class="comment-body"><div class="comment-author">${profileAvatarLink(comment)}<a href="/users/${escapeHtml(comment.userId)}">${escapeHtml(comment.userName)}</a></div><p>${escapeHtml(comment.body)}</p>${user?.id === comment.userId ? deleteCommentForm(comment, report, spot) : ""}</div>`;
}

function deleteCommentForm(comment, report, spot) {
  return `<form class="comment-delete-form" method="post" action="/comments/${escapeHtml(comment.id)}/delete" data-confirm="Are you sure you want to delete this comment?"><input type="hidden" name="next" value="/spots/${escapeHtml(spot.slug)}"><input type="hidden" name="reportId" value="${escapeHtml(report.id)}"><button class="comment-delete-button" type="submit">Delete</button></form>`;
}

export function reportFormPage({ user, spot, error = "", values = {} }) {
  return layout({
    title: `Create Report for ${spot.name}`,
    user,
    active: "map",
    flash: error,
    body: `<section class="report-editor-page"><div class="report-editor-intro" style="background-image:linear-gradient(0deg,rgba(4,25,31,.82),rgba(4,25,31,.14)),url('${escapeHtml(spot.imageUrl)}')"><div><p class="eyebrow light">${escapeHtml(spot.name)}</p><h1>Create Surf Report</h1><p>Share what you see so the next surfer has a clearer picture of the lineup.</p></div></div><form class="report-form" method="post" enctype="multipart/form-data" action="/spots/${escapeHtml(spot.slug)}/reports"><label>Video (Optional)<span>Upload a short MP4, WebM, or MOV clip of the current conditions.</span><input type="file" name="video" accept="video/mp4,video/webm,video/quicktime"></label><label>Description<span>Tell surfers what you are seeing from the beach.</span><textarea name="description" maxlength="280" placeholder="Example: 3–4 ft and clean with a light offshore breeze. Best sets are lining up near the south peak." required>${escapeHtml(values.description || "")}</textarea></label><div class="form-row"><label>Wave Height (Feet)<span>Enter the average face height you are seeing.</span><input type="number" name="waveHeight" min="1" max="100" placeholder="4" value="${escapeHtml(values.waveHeight || "")}" required></label><label>Rating, 1–10 (Optional)<span>Use 1 for poor conditions and 10 for firing conditions.</span><input type="number" name="rating" min="1" max="10" placeholder="7" value="${escapeHtml(values.rating || "")}"></label></div><button class="primary-button" type="submit">Save Report</button></form></section>`
  });
}

export function editReportPage({ user, report, error = "" }) {
  return layout({
    title: `Edit Report for ${report.surfSpotName}`,
    user,
    active: "account",
    flash: error,
    body: `<section class="report-editor-page edit-report-page"><div class="report-editor-intro"><div><p class="eyebrow light">${escapeHtml(report.surfSpotName)}</p><h1>Edit Report</h1><p>Reports can only be edited within three hours. Updated reports show an Edited label.</p></div></div><form class="report-form" method="post" action="/reports/${escapeHtml(report.id)}/edit"><label>Description<span>Update what surfers should know about the conditions.</span><textarea name="description" maxlength="280" required>${escapeHtml(report.description || "")}</textarea></label><div class="form-row"><label>Wave Height (Feet)<span>Enter the average face height you are seeing.</span><input type="number" name="waveHeight" min="1" max="100" value="${escapeHtml(report.waveHeight || "")}" required></label><label>Rating, 1–10 (Optional)<span>Use 1 for poor conditions and 10 for firing conditions.</span><input type="number" name="rating" min="1" max="10" value="${escapeHtml(report.rating || "")}"></label></div><div class="form-actions"><button class="primary-button" type="submit">Save Changes</button><a class="secondary-button" href="/account">Back to Account</a></div></form></section>`
  });
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
  if (/\.(mp4|webm|mov)$/i.test(mediaUrl)) return `<video class="report-video" controls preload="metadata" src="${escapedUrl}"></video>`;
  return `<img src="${escapedUrl}" alt="Surf Report Media">`;
}

function profileAvatarLink(person) {
  const user = { id: person.userId ?? person.id, name: person.userName ?? person.name, avatarUrl: person.userAvatarUrl ?? person.avatarUrl };
  return `<a class="profile-avatar-link" href="/users/${escapeHtml(user.id)}" aria-label="View ${escapeHtml(user.name)} Profile">${avatarMarkup(user, "mini-avatar")}</a>`;
}

function avatarMarkup(person, className) {
  const initials = String(person.name || person.userName || "S").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const avatarUrl = person.avatarUrl || person.userAvatarUrl;
  return `<span class="avatar ${className}">${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="">` : `<span>${escapeHtml(initials || "S")}</span>`}</span>`;
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

function profileBadgeName(reportCount = 0) {
  const count = Number(reportCount);
  if (count >= 1000) return "1K Reports";
  if (count >= 100) return "100 Reports";
  if (count >= 10) return "10 Reports";
  return "New Contributor";
}

function profileBadgeProgress(reportCount = 0) {
  const count = Number(reportCount);
  if (count >= 1000) return "Highest Badge Earned";
  if (count >= 100) return `${1000 - count} More Reports Until 1K Reports`;
  if (count >= 10) return `${100 - count} More Reports Until 100 Reports`;
  return `${10 - count} More Reports Until 10 Reports`;
}

function profileBadgePercent(reportCount = 0) {
  const count = Number(reportCount);
  if (count >= 1000) return 100;
  if (count >= 100) return Math.min(100, ((count - 100) / 900) * 100);
  if (count >= 10) return Math.min(100, ((count - 10) / 90) * 100);
  return Math.min(100, (count / 10) * 100);
}

function regionForLatitude(latitude) {
  const value = Number(latitude);
  if (value >= 33.0) return "north";
  if (value >= 32.77) return "central";
  return "south";
}

function formatCount(value, singular) {
  const count = Number(value || 0);
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(parseSqliteDate(value));
}

function formatLiveTimestamp(value = new Date()) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" }).format(new Date(value));
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
  if (typeof value === "string" && !value.includes("T")) return new Date(`${value.replace(" ", "T")}Z`);
  return new Date(value);
}

function canEditReport(report) {
  return Date.now() - parseSqliteDate(report.createdAt).getTime() <= 3 * 60 * 60 * 1000;
}

// Shared browser interactions for the side drawer, account forms, comments,
// report confirmations, and the live surf map.
window.addEventListener("DOMContentLoaded", () => {
  initializeDrawer();
  initializeHeaderScroll();
  initializeConfirmForms();
  initializeReplyToggles();
  initializePasswordToggles();
  initializeMapFilters();
  initializeSurfMap();
});

function initializeHeaderScroll() {
  const header = document.querySelector(".topbar");
  if (!header) return;

  let previousScrollPosition = window.scrollY;
  window.addEventListener("scroll", () => {
    const currentScrollPosition = window.scrollY;
    const scrollingDown = currentScrollPosition > previousScrollPosition + 6;
    const scrollingUp = currentScrollPosition < previousScrollPosition - 6;

    if (document.body.classList.contains("menu-open") || currentScrollPosition < 56 || scrollingUp) {
      header.classList.remove("is-hidden");
    } else if (scrollingDown) {
      header.classList.add("is-hidden");
    }

    previousScrollPosition = currentScrollPosition;
  }, { passive: true });
}

function initializeDrawer() {
  const drawer = document.querySelector("[data-drawer]");
  if (!drawer) return;

  const openDrawer = () => {
    document.body.classList.add("menu-open");
    document.querySelector(".topbar")?.classList.remove("is-hidden");
    drawer.setAttribute("aria-hidden", "false");
  };

  const closeDrawer = () => {
    document.body.classList.remove("menu-open");
    drawer.setAttribute("aria-hidden", "true");
  };

  document.querySelectorAll("[data-menu-open]").forEach((button) => button.addEventListener("click", openDrawer));
  document.querySelectorAll("[data-menu-close]").forEach((button) => button.addEventListener("click", closeDrawer));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });
}

// Any form with data-confirm shows an "Are you sure?" popup before submitting.
// This protects report, comment, avatar, and other delete actions.
function initializeConfirmForms() {
  document.querySelectorAll("form[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      const message = form.dataset.confirm || "Are you sure?";
      if (!window.confirm(message)) event.preventDefault();
    });
  });
}

function initializePasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    const field = button.closest(".password-field");
    const input = field?.querySelector("[data-password-toggle-input]");
    if (!input) return;

    button.addEventListener("click", () => {
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      button.textContent = isHidden ? "Hide" : "Show";
      button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
      button.setAttribute("aria-pressed", String(isHidden));
      input.focus();
    });
  });
}

function initializeReplyToggles() {
  document.querySelectorAll("[data-reply-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const replyForm = button.nextElementSibling;
      if (!replyForm) return;
      const isHidden = replyForm.hasAttribute("hidden");
      replyForm.toggleAttribute("hidden", !isHidden);
      button.textContent = isHidden ? "Cancel Reply" : "Reply";
      if (isHidden) replyForm.querySelector("textarea")?.focus();
    });
  });
}

function initializeMapFilters() {
  const filterButtons = [...document.querySelectorAll("[data-map-filter]")];
  const reportCards = [...document.querySelectorAll("[data-report-region]")];
  if (!filterButtons.length || !reportCards.length) return;

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const region = button.dataset.mapFilter;
      filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      reportCards.forEach((card) => card.toggleAttribute("hidden", region !== "all" && card.dataset.reportRegion !== region));
    });
  });
}

function initializeSurfMap() {
  const mapElement = document.querySelector("#surf-map");
  if (!mapElement || !window.L) return;

  const spots = JSON.parse(mapElement.dataset.spots || "[]");
  const map = L.map(mapElement, { scrollWheelZoom: true, zoomControl: false }).setView([32.92, -117.28], 10);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  const markerIcon = (spot) => L.divIcon({
    className: `surf-marker${spot.hasReportToday ? " has-report-today" : ""}`,
    html: "",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26]
  });

  const markerBounds = [];
  const markerRecords = [];

  spots.forEach((spot) => {
    markerBounds.push([spot.latitude, spot.longitude]);
    const marker = L.marker([spot.latitude, spot.longitude], { icon: markerIcon(spot) })
      .addTo(map)
      .bindPopup(`<strong>${escapeMapText(spot.name)}</strong>${spot.hasReportToday ? "<br>New Report Today" : ""}<br><a href="/spots/${encodeURIComponent(spot.slug)}">View Spot</a>`);
    markerRecords.push({ marker, spot });
  });

  const resetView = () => {
    map.closePopup();
    const search = document.querySelector("[data-map-search]");
    if (search) search.value = "";
    if (markerBounds.length) {
      map.flyToBounds(markerBounds, { padding: [42, 42], maxZoom: 10, duration: 0.7 });
      return;
    }
    map.flyTo([32.92, -117.28], 10, { duration: 0.7 });
  };

  resetView();
  addResetControl(map, resetView);
  initializeMapSearch(map, markerRecords, resetView);
}

function initializeMapSearch(map, markerRecords, resetView) {
  const search = document.querySelector("[data-map-search]");
  if (!search) return;

  search.addEventListener("input", () => {
    const term = search.value.trim().toLowerCase();
    if (!term) {
      resetView();
      return;
    }

    const match = markerRecords.find(({ spot }) => spot.name.toLowerCase().includes(term));
    if (!match) return;
    map.flyTo([match.spot.latitude, match.spot.longitude], 13, { duration: 0.55 });
    match.marker.openPopup();
  });
}

function addResetControl(map, resetView) {
  const resetControl = L.control({ position: "bottomright" });
  resetControl.onAdd = () => {
    const container = L.DomUtil.create("div", "leaflet-bar reset-view-control");
    const button = L.DomUtil.create("button", "", container);
    button.type = "button";
    button.setAttribute("aria-label", "Reset Map View");
    button.title = "Reset Map View";
    button.textContent = "↺";
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(button, "click", (event) => {
      L.DomEvent.stop(event);
      resetView();
    });
    return container;
  };
  resetControl.addTo(map);
}

function escapeMapText(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

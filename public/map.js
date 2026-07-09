// This file runs in the user's browser. It handles clickable/interactive parts
// of the site, like the map, delete popups, replies, and password Show/Hide.
window.addEventListener("DOMContentLoaded", () => {
  initializeHeaderScroll();
  initializeConfirmForms();
  initializeReplyToggles();
  initializePasswordToggles();

  // This same file loads on every page. If this page does not have the map
  // element, stop before running any map code.
  const mapElement = document.querySelector("#surf-map");
  if (!mapElement || !window.L) return;

  // The server puts all surf spot info into this page so the browser can draw
  // map markers.
  const spots = JSON.parse(mapElement.dataset.spots || "[]");
  const mapShell = mapElement.closest(".map-shell");

  // Create the map. Leaflet is the map library, like the engine behind the map.
  // We turn off the default zoom buttons so we can place our own in the corner.
  const map = L.map(mapElement, { scrollWheelZoom: true, zoomControl: false }).setView([32.92, -117.28], 10);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  // Build custom circular markers. Spots with a report today get a red dot.
  const markerIcon = (spot) => L.divIcon({
    className: `surf-marker${spot.hasReportToday ? " has-report-today" : ""}`,
    html: spot.hasReportToday ? '<span class="fresh-report-dot" aria-hidden="true"></span>' : "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12]
  });

  const markerBounds = [];

  // Add one marker and popup for every surf spot.
  spots.forEach((spot) => {
    markerBounds.push([spot.latitude, spot.longitude]);
    L.marker([spot.latitude, spot.longitude], { icon: markerIcon(spot) })
      .addTo(map)
      .bindPopup(`<strong>${spot.name}</strong><br>${spot.difficulty}${spot.hasReportToday ? "<br>New Report Today" : ""}<br><a href="/spots/${spot.slug}">View</a>`);
  });

  // Reset view zooms the map back out so all surf spot markers fit on screen.
  const resetView = () => {
    if (markerBounds.length) {
      map.flyToBounds(markerBounds, { padding: [40, 40], maxZoom: 10, duration: 0.7 });
      return;
    }

    map.flyTo([32.92, -117.28], 10, { duration: 0.7 });
  };

  resetView();
  addResetControl(map, resetView);

  // Once the user starts using the map, hide the floating intro panels so the map
  // has more room.
  const hidePanels = () => {
    mapShell?.classList.add("map-panels-hidden");
  };

  map.on("click dragstart zoomstart popupopen", hidePanels);
});

// Any form with data-confirm shows an "are you sure?" popup before it submits.
// This is used for deleting reports and comments.
function initializeConfirmForms() {
  document.querySelectorAll("form[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      const message = form.dataset.confirm || "Are you sure?";
      if (!window.confirm(message)) {
        event.preventDefault();
      }
    });
  });
}

// Login password Show/Hide button. This only changes whether the password is
// visible on screen; it does not change what the user typed.
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

// Reply forms start hidden. Clicking Reply opens the form under that comment.
function initializeReplyToggles() {
  document.querySelectorAll("[data-reply-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const replyForm = button.nextElementSibling;
      if (!replyForm) return;
      const isHidden = replyForm.hasAttribute("hidden");
      replyForm.toggleAttribute("hidden", !isHidden);
      button.textContent = isHidden ? "Cancel Reply" : "Reply";
    });
  });
}

// Adds the ↺ button that resets the map view.
function addResetControl(map, resetView) {
  const resetControl = L.control({ position: "bottomright" });

  resetControl.onAdd = () => {
    const container = L.DomUtil.create("div", "leaflet-bar reset-view-control");
    const button = L.DomUtil.create("button", "", container);
    button.type = "button";
    button.setAttribute("aria-label", "Reset map view");
    button.title = "Reset map view";
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

// Hides the nav when scrolling down and brings it back when scrolling up so the
// header does not cover the page.
function initializeHeaderScroll() {
  const header = document.querySelector(".site-header");
  if (!header) return;

  let lastScrollY = window.scrollY;
  let ticking = false;

  const updateHeader = () => {
    const currentScrollY = window.scrollY;
    const isScrollingDown = currentScrollY > lastScrollY + 2;
    const isScrollingUp = currentScrollY < lastScrollY - 2;

    if (currentScrollY <= 40 || isScrollingUp) {
      header.classList.remove("header-hidden");
    } else if (isScrollingDown && currentScrollY > 72) {
      header.classList.add("header-hidden");
    }

    lastScrollY = Math.max(currentScrollY, 0);
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateHeader);
  }, { passive: true });
}

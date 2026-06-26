window.addEventListener("DOMContentLoaded", () => {
  initializeHeaderScroll();
  initializeConfirmForms();

  const mapElement = document.querySelector("#surf-map");
  if (!mapElement || !window.L) return;

  const spots = JSON.parse(mapElement.dataset.spots || "[]");
  const mapShell = mapElement.closest(".map-shell");
  const map = L.map(mapElement, { scrollWheelZoom: true, zoomControl: false }).setView([32.92, -117.28], 10);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  const markerIcon = (spot) => L.divIcon({
    className: `surf-marker${spot.hasReportToday ? " has-report-today" : ""}`,
    html: spot.hasReportToday ? '<span class="fresh-report-dot" aria-hidden="true"></span>' : "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12]
  });

  const markerBounds = [];

  spots.forEach((spot) => {
    markerBounds.push([spot.latitude, spot.longitude]);
    L.marker([spot.latitude, spot.longitude], { icon: markerIcon(spot) })
      .addTo(map)
      .bindPopup(`<strong>${spot.name}</strong><br>${spot.difficulty}${spot.hasReportToday ? "<br>New Report Today" : ""}<br><a href="/spots/${spot.slug}">View</a>`);
  });

  const resetView = () => {
    if (markerBounds.length) {
      map.flyToBounds(markerBounds, { padding: [40, 40], maxZoom: 10, duration: 0.7 });
      return;
    }

    map.flyTo([32.92, -117.28], 10, { duration: 0.7 });
  };

  resetView();
  addResetControl(map, resetView);

  const hidePanels = () => {
    mapShell?.classList.add("map-panels-hidden");
  };

  map.on("click dragstart zoomstart popupopen", hidePanels);
});

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

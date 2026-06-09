window.addEventListener("DOMContentLoaded", () => {
  const mapElement = document.querySelector("#surf-map");
  if (!mapElement || !window.L) return;

  const spots = JSON.parse(mapElement.dataset.spots || "[]");
  const mapShell = mapElement.closest(".map-shell");
  const map = L.map(mapElement, { scrollWheelZoom: true }).setView([32.92, -117.28], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  const markerIcon = L.divIcon({
    className: "surf-marker",
    html: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12]
  });

  const markerBounds = [];

  spots.forEach((spot) => {
    markerBounds.push([spot.latitude, spot.longitude]);
    L.marker([spot.latitude, spot.longitude], { icon: markerIcon })
      .addTo(map)
      .bindPopup(`<strong>${spot.name}</strong><br>${spot.difficulty}<br><a href="/spots/${spot.slug}">View</a>`);
  });

  if (markerBounds.length) {
    map.fitBounds(markerBounds, { padding: [40, 40], maxZoom: 10 });
  }

  const hidePanels = () => {
    mapShell?.classList.add("map-panels-hidden");
  };

  map.on("click dragstart zoomstart popupopen", hidePanels);
});

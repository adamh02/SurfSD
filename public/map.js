window.addEventListener("DOMContentLoaded", () => {
  const mapElement = document.querySelector("#surf-map");
  if (!mapElement || !window.L) return;

  const spots = JSON.parse(mapElement.dataset.spots || "[]");
  const map = L.map(mapElement, { scrollWheelZoom: true }).setView([32.92, -117.28], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  const markerIcon = L.divIcon({
    className: "surf-marker",
    html: "<span></span>",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12]
  });

  spots.forEach((spot) => {
    L.marker([spot.latitude, spot.longitude], { icon: markerIcon })
      .addTo(map)
      .bindPopup(`<strong>${spot.name}</strong><br>${spot.difficulty}<br><a href="/spots/${spot.slug}">View</a>`);
  });
});

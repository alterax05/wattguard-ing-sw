import L from "leaflet"

export const buildingMarkerIcon = L.divIcon({
  html: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="12" fill="#0F5132" stroke="white" stroke-width="2"/>
    <circle cx="16" cy="16" r="4" fill="white"/>
  </svg>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

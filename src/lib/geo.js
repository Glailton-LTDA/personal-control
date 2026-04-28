/**
 * Calculates the distance between two points on Earth using the Haversine formula.
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimates total distance for an itinerary.
 * @param {Array} itinerary List of itinerary entries with coordinates
 * @returns {number} Total distance in km
 */
export function estimateItineraryDistance(itinerary) {
  if (!itinerary || itinerary.length < 2) return 0;

  // Filter and sort all entries by day and time
  const sortedEntries = itinerary
    .filter(e => e.coordinates && Array.isArray(e.coordinates) && e.coordinates.length === 2)
    .sort((a, b) => {
      const dayCompare = (a.day || '').localeCompare(b.day || '');
      if (dayCompare !== 0) return dayCompare;
      return (a.time || '00:00').localeCompare(b.time || '00:00');
    });

  if (sortedEntries.length < 2) return 0;

  let totalDist = 0;

  for (let i = 0; i < sortedEntries.length - 1; i++) {
    const p1 = sortedEntries[i].coordinates;
    const p2 = sortedEntries[i + 1].coordinates;
    
    // Photon/Leaflet usually returns [lon, lat] or [lat, lon] depending on convention.
    // Our system uses [lon, lat] based on previous logs.
    const dist = calculateDistance(p1[1], p1[0], p2[1], p2[0]);
    if (!isNaN(dist)) {
      totalDist += dist;
    }
  }

  return Math.round(totalDist);
}

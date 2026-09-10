/**
 * Calculates the geodesic distance between two latitude/longitude coordinates in meters
 * using the Haversine formula.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const diffLat = ((lat2 - lat1) * Math.PI) / 180;
  const diffLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(diffLat / 2) * Math.sin(diffLat / 2) +
    Math.cos(radLat1) *
      Math.cos(radLat2) *
      Math.sin(diffLon / 2) *
      Math.sin(diffLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Checks if a user's location is within the specified boundary radius of a target location.
 */
export function isWithinGeofence(
  userLat: number,
  userLng: number,
  targetLat: number,
  targetLng: number,
  radiusMeters: number = 150
): boolean {
  const distance = calculateDistance(userLat, userLng, targetLat, targetLng);
  return distance <= radiusMeters;
}

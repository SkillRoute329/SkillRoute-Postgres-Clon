function haversine(p1, p2) {
  const R = 6371;
  const dLat = (p2[0] - p1[0]) * Math.PI / 180;
  const dLon = (p2[1] - p1[1]) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(p1[0] * Math.PI / 180) * Math.cos(p2[0] * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function calculateSharedDistance(route1, route2, thresholdKm = 0.05) { // 50 meters
  if (!route1.length || !route2.length) return 0;
  
  let sharedDist = 0;
  let isCurrentlyOverlapping = false;
  
  for (let i = 1; i < route1.length; i++) {
    const p1_prev = route1[i - 1];
    const p1_curr = route1[i];
    
    // Check if current point is near any point in route2
    // To optimize, we can just do a linear scan since arrays are small, or keep track of last found index
    let isOverlapping = false;
    for (let j = 0; j < route2.length; j++) {
      if (haversine(p1_curr, route2[j]) <= thresholdKm) {
        isOverlapping = true;
        break;
      }
    }
    
    if (isOverlapping) {
      // If we are in an overlapping segment, add the distance from previous point to current point
      // (Even if previous point wasn't overlapping, this counts the entry segment. Or we can strictly require previous point to be overlapping too)
      if (isCurrentlyOverlapping) {
         sharedDist += haversine(p1_prev, p1_curr);
      }
      isCurrentlyOverlapping = true;
    } else {
      isCurrentlyOverlapping = false;
    }
  }
  return sharedDist;
}

// Generate dummy data: line 1 from (0,0) to (0,10) with 100 points
const route1 = [];
for (let i = 0; i <= 100; i++) route1.push([0, i * 0.1]);

// Line 2 from (0,5) to (0,15) with 100 points
const route2 = [];
for (let i = 0; i <= 100; i++) route2.push([0, 5 + i * 0.1]);

console.time('intersection');
const total1 = calculateSharedDistance(route1, route1, 0.01);
const shared = calculateSharedDistance(route1, route2, 0.01);
console.timeEnd('intersection');

console.log('Total1 KM (approx):', total1);
console.log('Shared KM (approx):', shared);

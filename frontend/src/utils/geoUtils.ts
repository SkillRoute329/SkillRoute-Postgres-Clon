export const haversine = (p1: [number, number], p2: [number, number]): number => {
  const R = 6371; // Radio de la Tierra en KM
  const dLat = (p2[0] - p1[0]) * Math.PI / 180;
  const dLon = (p2[1] - p1[1]) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(p1[0] * Math.PI / 180) * Math.cos(p2[0] * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
};

export const calculateTotalDistance = (coords: [number, number][]): number => {
  if (!coords || coords.length < 2) return 0;
  let dist = 0;
  for (let i = 1; i < coords.length; i++) {
    dist += haversine(coords[i-1], coords[i]);
  }
  return dist;
};

export const calculateSharedDistance = (route1: [number, number][], route2: [number, number][], thresholdKm = 0.05): number => {
  if (!route1 || !route2 || !route1.length || !route2.length) return 0;
  
  let sharedDist = 0;
  let isCurrentlyOverlapping = false;
  let lastMatchIdx = 0;
  
  for (let i = 1; i < route1.length; i++) {
    const p1_prev = route1[i - 1];
    const p1_curr = route1[i];
    
    let isOverlapping = false;
    // Búsqueda en ventana local primero por eficiencia
    const startIdx = Math.max(0, lastMatchIdx - 100);
    const endIdx = Math.min(route2.length, lastMatchIdx + 100);
    
    for (let j = startIdx; j < endIdx; j++) {
      if (haversine(p1_curr, route2[j]) <= thresholdKm) {
        isOverlapping = true;
        lastMatchIdx = j;
        break;
      }
    }
    
    // Si no se encuentra en la ventana local, búsqueda completa (puede haber cruces lejanos)
    if (!isOverlapping) {
      for (let j = 0; j < route2.length; j++) {
        if (haversine(p1_curr, route2[j]) <= thresholdKm) {
          isOverlapping = true;
          lastMatchIdx = j;
          break;
        }
      }
    }
    
    if (isOverlapping) {
      if (isCurrentlyOverlapping) {
         sharedDist += haversine(p1_prev, p1_curr);
      }
      isCurrentlyOverlapping = true;
    } else {
      isCurrentlyOverlapping = false;
    }
  }
  return sharedDist;
};

export const getSharedCoordinates = (route1: [number, number][], route2: [number, number][], thresholdKm = 0.05): [number, number][][] => {
  if (!route1 || !route2 || !route1.length || !route2.length) return [];
  
  const sharedSegments: [number, number][][] = [];
  let currentSegment: [number, number][] = [];
  let lastMatchIdx = 0;
  
  for (let i = 0; i < route1.length; i++) {
    const p1_curr = route1[i];
    let isOverlapping = false;
    
    // Búsqueda en ventana local primero por eficiencia
    const startIdx = Math.max(0, lastMatchIdx - 100);
    const endIdx = Math.min(route2.length, lastMatchIdx + 100);
    
    for (let j = startIdx; j < endIdx; j++) {
      if (haversine(p1_curr, route2[j]) <= thresholdKm) {
        isOverlapping = true;
        lastMatchIdx = j;
        break;
      }
    }
    
    // Si no se encuentra en la ventana local, búsqueda completa (puede haber cruces lejanos)
    if (!isOverlapping) {
      for (let j = 0; j < route2.length; j++) {
        if (haversine(p1_curr, route2[j]) <= thresholdKm) {
          isOverlapping = true;
          lastMatchIdx = j;
          break;
        }
      }
    }
    
    if (isOverlapping) {
      currentSegment.push(p1_curr);
    } else {
      if (currentSegment.length > 1) {
        sharedSegments.push([...currentSegment]);
      }
      currentSegment = [];
    }
  }
  
  // Añadir el último segmento si aplica
  if (currentSegment.length > 1) {
    sharedSegments.push([...currentSegment]);
  }
  
  return sharedSegments;
};

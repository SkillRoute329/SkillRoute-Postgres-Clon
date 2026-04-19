const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371e3; // metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getShortestHeadingDiff = (h1, h2) => {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
};

// Simulation Data
const UCOT_BUS = { line: '300', lat: -34.85, lng: -56.16, heading: 90 };
const RIVAL_BUS = { line: '103', lat: -34.851, lng: -56.161, heading: 95 }; // ~140m away, same direction

async function testProximity() {
  console.log('--- TEST 1: Proximity Detection ---');
  const dist = calculateDistance(UCOT_BUS.lat, UCOT_BUS.lng, RIVAL_BUS.lat, RIVAL_BUS.lng);
  const hDiff = getShortestHeadingDiff(UCOT_BUS.heading, RIVAL_BUS.heading);
  
  console.log(`Distance: ${dist.toFixed(2)}m`);
  console.log(`Heading Diff: ${hDiff}°`);
  
  const isThreat = dist < 850 && hDiff < 45;
  console.log(`Is Threat Detected? ${isThreat ? 'YES' : 'NO'}`);
  
  if (isThreat) console.log('✅ Proximity Logic Passed');
  else console.log('❌ Proximity Logic Failed');
}

async function testOllama() {
  console.log('\n--- TEST 2: Ollama AI Connection ---');
  try {
    const prompt = "Línea: 300. Rival: 103 a 140m. Nivel: CRITICAL. Da una orden táctica corta (máx 15 palabras) tuteando al chofer uruguayo.";
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({ model: 'gemma3:4b', prompt, stream: false }),
      timeout: 5000
    });

    if (response.ok) {
      const json = await response.json();
      console.log('AI Response:', json.response);
      console.log('✅ Ollama Connection Passed');
    } else {
      console.log('❌ Ollama returned error status:', response.status);
    }
  } catch (e) {
    console.log('❌ Ollama Connection Failed:', e.message);
    console.log('Note: Ensure Ollama is running and gemma3:4b is downloaded.');
  }
}

async function runTests() {
  await testProximity();
  await testOllama();
}

runTests();

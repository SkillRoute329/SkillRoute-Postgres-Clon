import axios from 'axios';

async function test() {
  try {
    const res = await axios.get('http://localhost:3001/api/gtfs/lines?agencyId=70');
    console.log("Lines count:", res.data.data.length);
    console.log("Sample:", res.data.data.slice(0, 5));
    
    // Check line 17 specifically
    const line17 = res.data.data.filter((l: any) => l.codigo === '17');
    console.log("Line 17:", line17);
  } catch (err: any) {
    console.error("HTTP Error:", err.response?.status, err.response?.data);
  }
}

test();

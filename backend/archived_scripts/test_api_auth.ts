import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("Missing JWT_SECRET");
    const token = jwt.sign({ id: 1, internalNumber: '329', role: 'SUPERADMIN', agency_id: '70' }, secret, { expiresIn: '1h' });
    
    const res = await fetch("http://127.0.0.1:3001/api/intelligence/competitors?route_id=316&direction_id=0", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response text:", text.substring(0, 1000));
  } catch(e) {
    console.error(e);
  }
}
test();

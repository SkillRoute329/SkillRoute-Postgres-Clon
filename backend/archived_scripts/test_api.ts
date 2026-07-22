async function test() {
  try {
    const res = await fetch("http://localhost:3001/api/intelligence/competitors?route_id=316&direction_id=0", {
      headers: { "Authorization": "Bearer dev-token" } // fake token, see if it returns 401 or 404
    });
    console.log("Status:", res.status);
    console.log("Text:", await res.text());
  } catch(e) {
    console.error(e);
  }
}
test();

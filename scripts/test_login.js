async function test() {
  const authRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ internalNumber: '329', password: 'Skill329' })
  });
  const data = await authRes.json();
  console.log(data);
}
test();

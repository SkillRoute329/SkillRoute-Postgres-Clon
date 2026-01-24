const https = require('https');

const data = JSON.stringify({
    internalNumber: "0000",
    password: "admin123"
});

const options = {
    hostname: 'transformafacil-20-production.up.railway.app',
    port: 443,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', body);
        if (res.statusCode === 200) {
            const parsed = JSON.parse(body);
            console.log('\n✅ LOGIN EXITOSO');
            console.log('Usuario:', parsed.user.fullName);
            console.log('Rol:', parsed.user.role);
            console.log('Token generado:', parsed.token.substring(0, 20) + '...');
        }
    });
});

req.on('error', (e) => {
    console.error('Error:', e.message);
});

req.write(data);
req.end();

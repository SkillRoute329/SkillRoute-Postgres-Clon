import fetch from 'node-fetch';

const BASE_URL = 'https://transformafacil-20-production.up.railway.app/api';

const run = async () => {
    try {
        // 1. Login Admin
        console.log('Login Admin...');
        const authRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ internalNumber: '329', password: '123456' }),
            headers: { 'Content-Type': 'application/json' }
        });
        const auth = await authRes.json();
        console.log('Auth Status:', authRes.status);
        if (!authRes.ok) return console.log(auth);

        const token = auth.token;
        console.log('Token len:', token.length);

        // 2. Create User
        const internal = 'debug_' + Math.floor(Math.random() * 1000);
        console.log('Creating user:', internal);

        const res = await fetch(`${BASE_URL}/users`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                internalNumber: internal,
                firstName: 'Debug',
                lastName: 'User',
                password: '123',
                role: 'User'
            })
        });

        console.log('Create Res Status:', res.status);
        const text = await res.text();
        console.log('Create Res Body:', text);

        if (res.ok) {
            console.log('Attempting Login with', internal, '123');
            const loginRes = await fetch(`${BASE_URL}/auth/login2`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ internalNumber: internal, password: '123' })
            });
            console.log('Login Status:', loginRes.status);
            const loginText = await loginRes.text();
            console.log('Login Body:', loginText);
        }

    } catch (e) {
        console.error(e);
    }
};

run();

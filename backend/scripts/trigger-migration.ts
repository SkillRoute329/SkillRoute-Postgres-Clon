
// const fetch = require('node-fetch'); // Native fetch in Node 22

async function run() {
    try {
        console.log('Triggering Internal Migration...');
        const res = await fetch('http://localhost:4000/api/system-config/init-schema', {
            method: 'POST'
        });
        const data = await res.json();
        console.log('Response:', data);
    } catch (e) {
        console.error('Error triggering migration:', e);
    }
}

run();

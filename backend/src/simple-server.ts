
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 [SIMPLE-SERVER] Starting minimal server...');
console.log(`🌍 [SIMPLE-SERVER] Env PORT: ${process.env.PORT}`);

app.get('/', (req, res) => {
    console.log('Creates a log entry when root is hit');
    res.send('HELLO FROM SIMPLE SERVER - V1');
});

app.get('/api/health', (req, res) => {
    console.log('🚑 [SIMPLE-SERVER] Health check hit!');
    res.json({ status: 'ok', type: 'minimal' });
});

app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`✅ [SIMPLE-SERVER] Listening on ${PORT}`);
});

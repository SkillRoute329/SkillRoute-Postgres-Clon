
const fs = require('fs');
const path = require('path');

// Target directory: frontend/public
const targetDir = path.join(__dirname, '../frontend/public');
const p192 = path.join(targetDir, 'pwa-192x192.png');
const p512 = path.join(targetDir, 'pwa-512x512.png');

// 1x1 Transparent PNG Buffer (Minimal valid PNG)
const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

console.log('🩹 AUTO-FIX: Checking PWA Assets...');

if (!fs.existsSync(targetDir)) {
    console.log('Creating public directory...');
    fs.mkdirSync(targetDir, { recursive: true });
}

if (!fs.existsSync(p192)) {
    fs.writeFileSync(p192, pngBuffer);
    console.log('✅ Generated pwa-192x192.png (Emergency Asset)');
} else {
    console.log('✓ pwa-192x192.png exists.');
}

if (!fs.existsSync(p512)) {
    fs.writeFileSync(p512, pngBuffer);
    console.log('✅ Generated pwa-512x512.png (Emergency Asset)');
} else {
    console.log('✓ pwa-512x512.png exists.');
}

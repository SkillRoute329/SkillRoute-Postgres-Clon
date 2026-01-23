
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    const timestamp = new Date().toLocaleString('es-UY', { timeZone: 'America/Montevideo' });

    const versionInfo = {
        branch,
        commit,
        timestamp,
        buildId: Math.random().toString(36).substring(7).toUpperCase()
    };

    const outputPath = path.resolve(__dirname, '../frontend/src/version.json');
    fs.writeFileSync(outputPath, JSON.stringify(versionInfo, null, 2));

    console.log('✅ Version info generated:', versionInfo);
} catch (error) {
    console.error('❌ Error generating version info', error);
    // Fallback
    const fallback = {
        branch: 'unknown',
        commit: '????',
        timestamp: new Date().toISOString(),
        buildId: 'DEV_MODE'
    };
    const outputPath = path.resolve(__dirname, '../frontend/src/version.json');
    fs.writeFileSync(outputPath, JSON.stringify(fallback, null, 2));
}


const { execSync } = require('child_process');

function push() {
    console.log('🚀 Iniciando subida a GitHub...');
    try {
        // 1. Add all
        execSync('git add .', { stdio: 'inherit' });
        console.log('✅ Archivos agregados.');

        // 2. Commit
        const commitMsg = `🚀 SYNC: Funcionalidades Flota y RRHH 100% - ${new Date().toISOString()}`;
        execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
        console.log('✅ Commit realizado.');

        // 3. Push
        execSync('git push origin main', { stdio: 'inherit' });
        console.log('✅ Push completado con éxito.');
    } catch (error) {
        console.error('❌ Error durante el push:', error.message);
        // If it fails because of push, maybe we need to pull first
        try {
            console.log('🔄 Intentando Pull antes de Push...');
            execSync('git pull origin main --rebase', { stdio: 'inherit' });
            execSync('git push origin main', { stdio: 'inherit' });
            console.log('✅ Push completado tras Rebase.');
        } catch (pullError) {
            console.error('❌ Fallo crítico en Git Sync:', pullError.message);
        }
    }
}

push();

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEPLOY_DIR = path.join(ROOT_DIR, 'deploy');

if (!fs.existsSync(DEPLOY_DIR)) {
    fs.mkdirSync(DEPLOY_DIR);
}

console.log('🚀 INICIANDO PREPARACIÓN DE DESPLIEGUE 🚀');
console.log('=========================================');

function step(name, fn) {
    try {
        console.log(`\n🔹 [PASO] ${name}...`);
        const result = fn();
        console.log(`✅ [OK] ${name}`);
        return result;
    } catch (error) {
        console.error(`\n❌ [ERROR] ${name}`);
        console.error(error.message);
        process.exit(1);
    }
}

// 1. Verificar Git Clean
step('Verificando estado de Git', () => {
    try {
        const status = execSync('git status --porcelain', { cwd: ROOT_DIR }).toString().trim();
        if (status) {
            console.warn('⚠️  ADVERTENCIA: Tienes cambios sin commitear:');
            console.warn(status);
            console.warn('   Se recomienda desplegar solo estados limpios.');
            // No forzamos error, pero avisamos.
        } else {
            console.log('   Git está limpio.');
        }
    } catch (e) {
        console.warn('   No se pudo verificar git (¿no es un repo?). Continuando...');
    }
});

// 2. Ejecutar Certificación
step('Ejecutando Certificación (npm run certify)', () => {
    execSync('npm run certify', { stdio: 'inherit', cwd: ROOT_DIR });
});

// 3. Capturar Versiones
const meta = step('Capturando Metadatos de Versión', () => {
    const nodeVer = execSync('node -v').toString().trim();
    const npmVer = execSync('npm -v').toString().trim();
    const date = new Date().toISOString();
    return { nodeVer, npmVer, date };
});

// 4. Generar Checklist
step('Generando Checklist de Go-Live', () => {
    const checklistContent = `# Checklist de Go-Live (Automatizado)

> **Fecha:** ${meta.date}
> **Node:** ${meta.nodeVer}
> **NPM:** ${meta.npmVer}

## 1. Fase Local (Completada)
- [x] **Git Clean Check**: Revisado
- [x] **Certificación Estructural**: OK
- [x] **Build & Install**: OK
- [x] **Test de Arranque**: OK
- [x] **Health Check Local**: OK

## 2. Fase de Despliegue (Manual)
- [ ] Push a GitHub (\`git push origin main\`)
- [ ] DigitalOcean/Render detecta el commit
- [ ] Esperar a que el Build termine (Green Check)

## 3. Fase de Verificación (Post-Deploy)
Ejecutar el siguiente comando con tu URL real:

\`\`\`bash
npm run deploy:verify <TU_URL_DE_LA_APP>
\`\`\`

Ejemplo:
\`npm run deploy:verify https://transformafacil-app.ondigitalocean.app\`

---
*Este archivo fue generado automáticamente por \`npm run deploy:prepare\`*
`;

    fs.writeFileSync(path.join(DEPLOY_DIR, 'GO_LIVE_CHECKLIST.md'), checklistContent);
    console.log(`   Checklist generado en: deploy/GO_LIVE_CHECKLIST.md`);
});

console.log('\n✨ LISTO PARA SUBIR CÓDIGO ✨');
console.log('Ejecuta ahora: git push origin main');

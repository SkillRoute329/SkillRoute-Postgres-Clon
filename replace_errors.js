const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach((f) => {
    let dirPath = path.join(dir, f);
    if (dirPath.includes('node_modules') || dirPath.includes('.git')) return;
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

function processFiles() {
  walkDir(path.join(__dirname, 'frontend/src'), (filePath) => {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // Let's count how many console.error we have
    const originalContent = content;

    // We will do a generic replacement if the file imports useToast.
    // Actually, dynamically importing useToast everywhere is complex because of paths.
    // Let's just use `alert("Error: " + error.message)` or check if we can do better.
    // User said: "(ej: "Error al conectar con GPS")".
    // Instead of breaking imports, let's use standard native `alert()` or `Toast` from capacitor if possible. Wait, we have window.dispatchEvent.

    let hasChanges = false;

    // Add a global dispatch event for toasts as a fallback if window exists
    content = content.replace(
      /catch\s*\(([^)]+)\)\s*{[\s\S]*?console\.error\([^)]+\);?\s*}/g,
      (match, errVar) => {
        hasChanges = true;
        return `catch (${errVar}) {\n            console.error(${errVar});\n            window.dispatchEvent(new CustomEvent('app-error', {detail: ${errVar}?.message || 'Error en la operación'}));\n        }`;
      },
    );

    if (hasChanges && content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Modified ${filePath}`);
    }
  });
}

processFiles();

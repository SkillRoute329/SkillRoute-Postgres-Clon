import fs from 'fs';
import path from 'path';

console.log('--- 🤖 ANTIGRAVITY AGENT DIAGNOSTIC ---');

const checkFile = (p: string) => {
  const exists = fs.existsSync(p);
  console.log(`${exists ? '✅' : '❌'} ${p}`);
};

const root = process.cwd();
console.log(`Root: ${root}`);

checkFile(path.join(root, 'frontend/package.json'));
checkFile(path.join(root, 'backend/package.json'));
checkFile(path.join(root, '.vscode/extensions.json'));
checkFile(path.join(root, '.prettierrc'));
checkFile(path.join(root, 'firebase.json'));

console.log('\n--- SYSTEM LOAD ---');
console.log(`Node Version: ${process.version}`);
console.log(`Platform: ${process.platform}`);
console.log('--- END DIAGNOSTIC ---');

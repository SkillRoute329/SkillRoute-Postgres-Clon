// fix_lint.cjs - Fixes common ESLint errors automatically
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get all relevant files
const result = execSync('npx eslint --format json "src/**/*.tsx" "src/**/*.ts" 2>nul', {
  cwd: path.join(__dirname, '..'),
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
});

let data;
try {
  data = JSON.parse(result);
} catch (e) {
  data = [];
}

let fixedFiles = 0;
let totalFixes = 0;

for (const file of data) {
  if (!file.messages.length) continue;

  let content = fs.readFileSync(file.filePath, 'utf8');
  let modified = false;
  const lines = content.split('\n');

  // Process messages in reverse (to avoid line number shifts)
  const sorted = [...file.messages].sort((a, b) => b.line - a.line);

  for (const msg of sorted) {
    const lineIdx = msg.line - 1;
    const line = lines[lineIdx];
    if (!line) continue;

    // Fix 1: @ts-ignore -> @ts-expect-error
    if (msg.ruleId === '@typescript-eslint/ban-ts-comment' && line.includes('@ts-ignore')) {
      lines[lineIdx] = line.replace('@ts-ignore', '@ts-expect-error');
      modified = true;
      totalFixes++;
    }

    // Fix 2: no-useless-escape - remove useless backslashes in regex/strings
    // Too complex to auto-fix safely, skip

    // Fix 3: catch (err: any) -> catch (err: unknown)
    if (msg.ruleId === '@typescript-eslint/no-explicit-any' && line.includes('catch (')) {
      const newLine = line.replace(/catch\s*\(\s*(\w+)\s*:\s*any\s*\)/, 'catch ($1: unknown)');
      if (newLine !== line) {
        lines[lineIdx] = newLine;
        modified = true;
        totalFixes++;
      }
    }
  }

  if (modified) {
    fs.writeFileSync(file.filePath, lines.join('\n'), 'utf8');
    fixedFiles++;
    console.log(`Fixed: ${path.relative(path.join(__dirname, '..', 'src'), file.filePath)}`);
  }
}

console.log(`\nTotal files fixed: ${fixedFiles}`);
console.log(`Total fixes applied: ${totalFixes}`);

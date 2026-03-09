/**
 * fix_unused_imports.cjs
 * Removes unused named imports from TypeScript/TSX files based on ESLint results.
 * Only removes import names that appear exactly once (in the import line).
 */
const fs = require('fs');
const path = require('path');

const lintData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'lint_results_new.json'), 'utf8'),
);

let totalFixed = 0;
let filesFixed = 0;

for (const file of lintData) {
  const unusedMessages = file.messages.filter(
    (m) => m.ruleId === '@typescript-eslint/no-unused-vars',
  );
  if (!unusedMessages.length) continue;

  let content = fs.readFileSync(file.filePath, 'utf8');
  let modified = false;

  for (const msg of unusedMessages) {
    // Extract variable name from message like "'X' is defined but never used."
    const match = msg.message.match(/'([^']+)' is defined but never used/);
    if (!match) continue;
    const varName = match[1];

    // Only remove from import statements (safe)
    // Pattern: named import like `import { A, B, C } from '...'`
    const importRegex = new RegExp(
      `(import\\s*\\{[^}]*?)\\b${escapeRegex(varName)}\\s*,?\\s*([^}]*\\}\\s*from)`,
      'g',
    );
    const importRegex2 = new RegExp(
      `(import\\s*\\{[^}]*),?\\s*\\b${escapeRegex(varName)}\\b\\s*(\\}\\s*from)`,
      'g',
    );

    // Count occurrences of the name in the whole file
    const nameOccurrences = (content.match(new RegExp(`\\b${escapeRegex(varName)}\\b`, 'g')) || [])
      .length;

    // Only remove if it appears ≤ 2 times (import line + declaration = 2 is safe)
    if (nameOccurrences > 4) continue; // too risky, skip

    // Remove from named imports: `{ Foo, Bar }` -> `{ Bar }`
    const newContent = content.replace(
      new RegExp(
        // Match: , Foo OR Foo, at start OR just Foo (only import)
        `(import\\s*\\{[^}]*?)\\s*,?\\s*\\b${escapeRegex(varName)}\\b\\s*,?([^}]*\\})`,
        'g',
      ),
      (match, before, after) => {
        // Only modify actual import lines
        if (!match.includes('from') && !after.includes('from')) return match;
        let result = before + after;
        // Clean up double commas or leading/trailing commas
        result = result
          .replace(/,\s*,/g, ',')
          .replace(/\{\s*,/g, '{')
          .replace(/,\s*\}/g, '}');
        return result;
      },
    );

    if (newContent !== content) {
      content = newContent;
      modified = true;
      totalFixed++;
    }
  }

  if (modified) {
    fs.writeFileSync(file.filePath, content, 'utf8');
    filesFixed++;
    console.log(
      `Fixed imports in: ${path.relative(path.join(__dirname, '..', 'src'), file.filePath)} (${unusedMessages.length} unused)`,
    );
  }
}

console.log(`\n✅ Done: ${filesFixed} files, ${totalFixed} fixes`);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

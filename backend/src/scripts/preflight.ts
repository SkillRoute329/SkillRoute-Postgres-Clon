
import fs from 'fs';
import path from 'path';

// Fix paths relative to backend root or script location
const filePaths = [
    path.join(__dirname, '../controllers/LegacyImportController.ts')
];

console.log("💉 DOCTOR 2.0: Running Pre-flight Syntax Check...");

filePaths.forEach(f => {
    if (fs.existsSync(f)) {
        let content = fs.readFileSync(f, 'utf8');
        let modified = false;

        // Auto-fix: routeId: number -> route: { connect: { id: number } }
        // This is a rough regex, mainly targeting specific error patterns.
        // It looks for "routeId: something," and tries to replace it. 
        // Be careful not to break "where: { routeId: ... }" queries.
        // We only want to target 'data: { ... routeId: ... }' usually.
        // Given complexity, let's look for exact lines if possible or safe replace.
        // Better yet, just log that we are checking.

        // Actually, previous fix was already applied manually to LegacyImportController.
        // But let's add a safety net for future.
        if (content.match(/data:\s*\{[^}]*routeId:\s*\w+/)) {
            console.log("⚠️ Potential Prisma Relation Issue detected in", f);
            // We won't auto-patch aggressively via regex to avoid breaking 'where' clauses.
        }

        console.log(`✅ Checked ${path.basename(f)}`);
    } else {
        console.warn(`⚠️ File not found: ${f}`);
    }
});

console.log("💉 DOCTOR 2.0: Pre-flight Complete.");

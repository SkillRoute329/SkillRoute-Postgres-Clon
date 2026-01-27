
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SCHEMA_PATH = path.join(__dirname, '../../prisma/schema.prisma');

async function evolve() {
    console.log("🧬 DB_EVOLUTION: Scanning schema for strictly required fields...");

    if (!fs.existsSync(SCHEMA_PATH)) {
        console.error("❌ Schema not found!");
        process.exit(1);
    }

    let schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    let modifications = 0;

    // RULE 1: Ensure 'metadata' exists on main models
    const targetModels = ['User', 'Route', 'Vehicle', 'TripSchedule', 'Shift'];

    targetModels.forEach(model => {
        // Regex to find model block
        // model Name { ... }
        const modelRegex = new RegExp(`model\\s+${model}\\s+\\{[^}]+\\}`, 'g');
        const match = schema.match(modelRegex);

        if (match) {
            const block = match[0];
            if (!block.includes('metadata')) {
                // This is a naive injection, but suffice for "Guardian" logic
                console.log(`⚠️ Missing 'metadata' in ${model}. Injecting...`);

                // Inject before the closing brace
                const newBlock = block.replace(/\}$/, '  metadata Json? @default("{}")\n}');
                schema = schema.replace(block, newBlock);
                modifications++;
            }
        }
    });

    if (modifications > 0) {
        console.log(`🧬 Applying ${modifications} evolutionary changes to Schema...`);
        fs.writeFileSync(SCHEMA_PATH, schema);

        console.log("⚙️ Running Migration...");
        try {
            // In a real CI environment, we might only generate. Or use deploy.
            // For now, we generate client to ensure TS knows about new fields.
            execSync('npx prisma generate', { stdio: 'inherit', cwd: path.join(__dirname, '../../') });
            console.log("✅ Evolution Complete. Schema updated.");
        } catch (e) {
            console.error("❌ Migration Failed:", e);
            process.exit(1);
        }
    } else {
        console.log("✅ Schema is consistent. No evolution needed.");
    }
}

evolve().catch(e => {
    console.error(e);
    process.exit(1);
});

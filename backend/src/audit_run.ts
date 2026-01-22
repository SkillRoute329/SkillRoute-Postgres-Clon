
import { SystemAudit } from './utils/DataAuditor';

(async () => {
    console.log("Starting Audit...");
    try {
        const report = await SystemAudit();
        console.log("\n" + report + "\n");
        process.exit(0);
    } catch (e) {
        console.error("Audit failed:", e);
        process.exit(1);
    }
})();

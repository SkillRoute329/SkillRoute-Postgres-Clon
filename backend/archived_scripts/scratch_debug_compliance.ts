import { analyzeComplianceForAgency } from './src/services/scheduleComplianceEngine';

async function run() {
  try {
    console.log("Fetching compliance for agency 70 (UCOT)...");
    const results = await analyzeComplianceForAgency('70');
    console.log(`Successfully fetched ${results.length} buses for UCOT.`);
    if (results.length > 0) {
      console.log("Sample bus:", JSON.stringify(results[0], null, 2));
    } else {
      console.log("WARNING: No UCOT buses returned. Let's check active available agencies.");
    }
  } catch (err) {
    console.error("FATAL ERROR running compliance:", err);
  }
}

run();

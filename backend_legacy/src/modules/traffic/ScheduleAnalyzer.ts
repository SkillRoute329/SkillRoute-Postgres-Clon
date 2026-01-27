
export class ScheduleAnalyzer {
    static analyzeDeviation(plannedTime: string, actualTime: string): { deviation: number, status: string } {
        // Mock parsing HH:MM
        const parse = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        const diff = parse(actualTime) - parse(plannedTime);
        let status = 'OK';

        if (diff > 10) status = 'LATE';
        if (diff < -5) status = 'EARLY_WARNING'; // Eco-driving sanction risk
        if (diff < -10) status = 'VERY_EARLY';

        return { deviation: diff, status };
    }

    static processTripLogs(logs: any[]) {
        console.log("🚦 TRAFFIC: Processing trip logs for Schedule Optimization...");

        const optimizations = [];
        // Aggregation logic would go here
        // If deviation > 10% consistently -> output suggestion

        return optimizations;
    }
}

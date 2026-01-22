
export class DriverScoreCard {
    static calculateDailyScore(metrics: { punctuality: number, ecoDriving: number, attendance: number }) {
        // Formula: (Puntualidad * 0.5) + (EcoDriving * 0.3) + (Presentismo * 0.2)
        const score = (metrics.punctuality * 0.5) + (metrics.ecoDriving * 0.3) + (metrics.attendance * 0.2);
        return Math.round(score * 100) / 100; // Round 2 decimals
    }

    static generateReport(driversData: any[]) {
        console.log("⚖️ HR: Generating Auto-Report...");

        const scoredDrivers = driversData.map(d => ({
            ...d,
            score: this.calculateDailyScore(d.metrics)
        })).sort((a, b) => b.score - a.score);

        return {
            topPerformers: scoredDrivers.slice(0, 5),
            lowPerformers: scoredDrivers.slice(-5),
            generatedAt: new Date()
        };
    }
}

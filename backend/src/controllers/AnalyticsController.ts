
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const AnalyticsController = {
    getHeatmapData: async (req: Request, res: Response) => {
        try {
            console.log("📊 ANALYTICS: Generating Heatmap Data...");

            // DEMO: In future, this will query MongoDB or JSONB Ticket records
            // For now, we return mock data based on recent shifts or bulletins if available

            /*
            const tickets = await prisma.ticket.findMany({
                where: {
                    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24h
                },
                select: { metadata: true }
            });
            */

            // Mock Heatmap Data for Demo
            const mockPoints = [
                { lat: -34.89, lng: -56.16, weight: 0.8 }, // Tres Cruces
                { lat: -34.90, lng: -56.19, weight: 0.5 }, // Centro
                { lat: -34.85, lng: -56.21, weight: 0.9 }, // Paso Molino
            ];

            return res.json({
                status: "Success",
                points: mockPoints,
                message: "Heatmap data generated from mock engine."
            });

        } catch (error) {
            console.error("❌ ANALYTICS ERROR:", error);
            return res.status(500).json({ status: "Error", message: String(error) });
        }
    }
};

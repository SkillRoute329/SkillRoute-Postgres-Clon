
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

export const AutoFixService = {
    /**
     * Executes the "AUTO-FIX" protocol on every server boot.
     * Ensures critical data integrity and physical file availability.
     */
    run: async () => {
        try {
            console.log("🛠️ AUTO-FIX: Starting Integrity Protocol...");

            // 1. CLEANUP (Garbage Collection)
            await AutoFixService.cleanGarbage();

            // 2. FOUNDATION (Ensure Master Routes exist)
            await AutoFixService.ensureFoundation();

            // 3. PHYSICAL ASSETS (Ensure Excel Template exists)
            await AutoFixService.generateTemplate();

            console.log("✅ AUTO-FIX: Protocol Completed Successfully.");

        } catch (error) {
            console.error("❌ AUTO-FIX FAILED:", error);
            // Non-blocking, allows system to try starting anyway
        }
    },

    cleanGarbage: async () => {
        console.log("🧹 AUTO-FIX: Removing corrupt records...");

        try {
            // RAW SQL SURGERY (User Request)
            // Attempt to clean legacy/misnamed 'Service' table if it exists
            await prisma.$executeRawUnsafe(`DELETE FROM "Service" WHERE "routeId" IS NULL;`).catch(() => { });
            await prisma.$executeRawUnsafe(`DELETE FROM "Service" WHERE "line" = 'A DEFINIR';`).catch(() => { });
        } catch (e) {
            // Ignore if table doesn't exist
        }

        // Remove ServiceDefinitions with no line or placeholder
        const { count: countSD } = await prisma.serviceDefinition.deleteMany({
            where: {
                OR: [
                    { line: "A DEFINIR" },
                    { line: "" },
                    { line: null }
                ]
            }
        });

        // Remove Shifts linked to corrupt data
        const { count: countShifts } = await prisma.shift.deleteMany({
            where: {
                OR: [
                    { line: "A DEFINIR" },
                    { line: "" }
                ]
            }
        });

        if (countSD + countShifts > 0) {
            console.log(`   -> Deleted ${countSD} corrupt definitions and ${countShifts} shifts.`);
        } else {
            console.log("   -> System is clean.");
        }
    },

    ensureFoundation: async () => {
        console.log("🏗️ AUTO-FIX: Verifying Foundation (Lines)...");
        const tenantId = 1;

        // UCOT Master Routes (Auto-Seeded)
        const lines = [
            // Urbanas
            { name: "300", desc: "Instrucciones Técnicas" },
            { name: "306", desc: "Casabó - Géant" },
            { name: "316", desc: "Urbana" },
            { name: "317", desc: "Urbana" },
            { name: "328", desc: "Urbana" },
            { name: "329", desc: "Urbana" },
            { name: "330", desc: "Urbana" },
            { name: "370", desc: "Portones - Cerro" },
            { name: "396", desc: "Urbana" },
            // Diferenciales / Locales
            { name: "CE1", desc: "Céntrica" },
            { name: "DM1", desc: "Diferencial Metropolitana" },
            { name: "L-12", desc: "Local" }, // Normalized to match file names if needed
            { name: "L-13", desc: "Local" },
            { name: "L-31", desc: "Local" },
            { name: "L-32", desc: "Local" },
            { name: "L-33", desc: "Local" },
            { name: "XA1", desc: "X-PRESS" },
            { name: "XA2", desc: "X-PRESS" }
        ];

        for (const line of lines) {
            await prisma.route.upsert({
                where: { tenantId_name: { tenantId, name: line.name } },
                update: {}, // Do nothing if exists
                create: {
                    tenantId,
                    name: line.name,
                    description: line.desc,
                    type: line.name.startsWith('D') ? 'SUBURBANA' : 'URBANA',
                    status: 'ACTIVE'
                }
            });
        }
        console.log(`   -> ${lines.length} Master Routes verified.`);
    },

    generateTemplate: async () => {
        console.log("📄 AUTO-FIX: Generating Official Excel Template...");

        // Define directory: backend/public or root/public? 
        // We probably want to put it where express static serves files or a known 'downloads' spot.
        // Assuming 'backend/public' exists or creating it.
        const publicDir = path.join(process.cwd(), 'public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }

        const filePath = path.join(publicDir, 'plantilla_oficial.xlsx');

        // Define Headers required by DataImportController
        const HEADERS = [
            'Servicio',        // serviceCode
            'Linea',           // line
            'HoraInicio',      // startTime
            'HoraFin',         // endTime
            'TipoCoche',       // vehicleType
            'TipoDia',         // dayType
            'Temporada'        // Name of season
        ];

        // Create Workbook
        const wb = XLSX.utils.book_new();
        const wsData = [
            HEADERS,
            ['1001', '300', '06:00', '14:00', 'Hibrido', 'HABIL', 'VERANO 2026'],
            ['1002', '306', '06:15', '14:15', 'Convencional', 'HABIL', 'VERANO 2026']
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Add validations/comments via cell object if needed, but simple data is enough
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');

        // Write to file
        XLSX.writeFile(wb, filePath);
        console.log(`   -> Template ready at ${filePath}`);
    }
};

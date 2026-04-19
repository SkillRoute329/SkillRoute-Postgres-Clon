import { ExcelParser } from './frontend/src/utils/ExcelParserV2';
import * as fs from 'fs';
import * as path from 'path';

async function test() {
  const filePath =
    'C:\\Users\\jonat\\Desktop\\PROYECTOS\\TransformaFacil-2.0\\CARTONES Hábil verano 2026 desde 26.12.2025.xls';
  const buffer = fs.readFileSync(filePath);
  const result = await ExcelParser.parse({
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  } as any);

  console.log(`Parsed ${result.services.length} services.`);

  // Check first 3 services
  result.services.slice(0, 3).forEach((s, i) => {
    console.log(
      `Service ${i}: Line=${s.lineCode}, Svc=${s.serviceNumber}, Notes=${s.destination?.length || 0}`,
    );
  });

  const unknown = result.services.filter((s) => s.lineCode === 'UNKNOWN');
  console.log(`Services with UNKNOWN line: ${unknown.length}`);
}

test().catch(console.error);

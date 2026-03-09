const fs = require('fs');
const readline = require('readline');

async function debugCSV() {
  const filePath = "C:\\tmp\\gtfs\\schedules_pt_extracted\\HORARIOS_OMNIBUS datos.csv";
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    if (line.includes(';306;')) {
        console.log("MATCH:", lineCount);
        console.log("LINE TEXT:", line);
        const parts = line.split(';');
        console.log("PARTS COUNT:", parts.length);
        parts.forEach((p, i) => console.log(` - [${i}] ${p}`));
        break;
    }
  }
}

debugCSV().catch(console.error);

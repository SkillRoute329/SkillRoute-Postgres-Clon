const fs = require('fs');
const readline = require('readline');

async function testRead() {
  const filePath = "C:\\tmp\\gtfs\\schedules_pt_extracted\\HORARIOS_OMNIBUS datos.csv";
  if (!fs.existsSync(filePath)) {
    console.error("File NOT found:", filePath);
    process.exit(1);
  }
  console.log("File found!");
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    count++;
    if (count < 5) console.log(`Line ${count}:`, line);
    if (count > 1000) break;
  }
  console.log("Read 1000 lines successfully.");
}

testRead().catch(console.error);

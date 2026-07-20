const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const url = 'https://ckan-data.montevideo.gub.uy/dataset/1205fc5c-b1b5-4478-b43e-c7411949ff15/resource/4a0cb185-9c12-417f-8f2c-a54caf572e94/download/viajes_stm_052026.zip';
const zipPath = path.join(__dirname, 'viajes_stm_052026.zip');

console.log('Downloading...');
https.get(url, (res) => {
  const file = fs.createWriteStream(zipPath);
  res.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('Downloaded.');
    try {
      execSync('tar -xf viajes_stm_052026.zip');
      console.log('Extracted.');
      // Find the CSV file
      const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.csv') && f.includes('052026'));
      if (files.length > 0) {
        const head = execSync(`powershell -Command "Get-Content ${files[0]} -TotalCount 5"`).toString();
        console.log('Header of', files[0], ':\n', head);
      } else {
         console.log('No CSV found.');
      }
    } catch (e) {
      console.error(e.message);
    }
  });
}).on('error', e => console.error(e));

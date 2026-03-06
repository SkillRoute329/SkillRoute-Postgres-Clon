const { exec } = require('child_process');
exec('npm run build', { cwd: __dirname }, (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
  }
  console.log(`STDOUT: ${stdout}`);
  console.log(`STDERR: ${stderr}`);
});

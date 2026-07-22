const { exec } = require('child_process');
exec('npm run build > build_log.txt 2>&1', { cwd: __dirname }, (error) => {
  if (error) {
    console.log('Build failed. Check build_log.txt');
  } else {
    console.log('Build success.');
  }
});

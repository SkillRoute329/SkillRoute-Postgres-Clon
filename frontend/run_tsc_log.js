const { exec } = require('child_process');
exec('npx tsc -b', { cwd: __dirname }, (error, stdout, stderr) => {
    const fs = require('fs');
    fs.writeFileSync('build_error.log', stdout + '\n' + stderr);
});

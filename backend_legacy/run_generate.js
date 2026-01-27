const { exec } = require('child_process');
exec('npx prisma generate', { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
        console.error(`exec error: ${error}`);
        console.error('STDERR:', stderr);
        return;
    }
    console.log(`STDOUT: ${stdout}`);
});

const { exec } = require('child_process');
const url = 'http://localhost:5173';
const delay = 6000;

setTimeout(() => {
  const cmd = process.platform === 'win32' ? `start ${url}` : `open "${url}"`;
  exec(cmd, () => {});
}, delay);

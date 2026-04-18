const { spawn } = require('child_process');
const fs = require('fs');
const out = fs.openSync('startup_logs.txt', 'w');
const child = spawn('npx.cmd', ['homey', 'app', 'run'], {
  stdio: ['ignore', out, out],
  detached: true,
});
child.unref();
console.log('App started and logging to startup_logs.txt. Process ID:', child.pid);

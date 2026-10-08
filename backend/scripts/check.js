const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'data', '.test-data'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (file.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}

check(path.join(__dirname, '..'));
console.log('Backend JavaScript syntax checks passed');

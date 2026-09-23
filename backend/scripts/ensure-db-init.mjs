import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('Ensuring DB initialization by importing config/db.js');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbModulePath = path.join(__dirname, '..', 'config', 'db.js');
import { pathToFileURL } from 'node:url';

import(pathToFileURL(dbModulePath).href).then(() => {
  console.log('DB init complete');
  process.exit(0);
}).catch(err => {
  console.error('DB init failed', err);
  process.exit(1);
});

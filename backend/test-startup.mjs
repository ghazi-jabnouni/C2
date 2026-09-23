console.log('Step 1: Starting...');

try {
  console.log('Step 2: Importing express...');
  const express = await import('express');
  console.log('Step 3: Express OK');

  console.log('Step 4: Importing better-sqlite3...');
  const Database = (await import('better-sqlite3')).default;
  console.log('Step 5: better-sqlite3 OK');

  console.log('Step 6: Opening database...');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dbPath = path.resolve(__dirname, 'database', 'sqlite.db');
  console.log('Step 7: DB path =', dbPath);
  
  const db = new Database(dbPath);
  console.log('Step 8: Database opened!');
  
  db.pragma('journal_mode = WAL');
  console.log('Step 9: WAL mode set');

  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'Operator',
    status TEXT NOT NULL DEFAULT 'active',
    lastLogin TEXT
  )`);
  console.log('Step 10: Schema OK');

  console.log('ALL GOOD — database works!');
  db.close();
} catch (err) {
  console.error('ERROR:', err);
}

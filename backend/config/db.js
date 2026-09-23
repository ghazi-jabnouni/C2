import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './server.config.js';

console.log('📦 [DB] Starting database initialization...');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB_PATH env var lets you mount the SQLite file to any path (e.g. a Docker volume)
const dbDir  = config.database.path
  ? path.dirname(path.resolve(config.database.path))
  : path.resolve(__dirname, '../database');
const dbPath = config.database.path
  ? path.resolve(config.database.path)
  : path.join(dbDir, config.database.filename);

console.log(`📂 [DB] Database directory: ${dbDir}`);
console.log(`🗄️ [DB] Database path: ${dbPath}`);

// Create database directory
try {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('✅ [DB] Database directory created');
  } else {
    console.log('✅ [DB] Database directory already exists');
  }
} catch (error) {
  console.error('❌ [DB] Cannot create database directory');
  console.error(error);
  process.exit(1);
}

// Open SQLite
let db;

try {
  console.log('🔌 [DB] Opening SQLite database...');
  db = new DatabaseSync(dbPath);
  console.log('✅ [DB] SQLite database opened successfully');
} catch (error) {
  console.error('❌ [DB] Failed to open SQLite database');
  console.error(error);
  process.exit(1);
}

// Enable WAL
try {
  db.exec('PRAGMA journal_mode = WAL;');
  console.log('✅ [DB] WAL mode enabled');
} catch (error) {
  console.warn('⚠️ [DB] WAL mode could not be enabled');
}

// Create users table with password field
try {
  console.log('📋 [DB] Creating users table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Operator',
      status TEXT NOT NULL DEFAULT 'active',
      lastLogin TEXT
    );
  `);
  console.log('✅ [DB] Users table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create users table');
  console.error(error);
  process.exit(1);
}

// Create repositories table
try {
  console.log('📋 [DB] Creating repositories table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gitUrl TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT 'main',
      credentialId TEXT,
      lastSync TEXT,
      status TEXT NOT NULL DEFAULT 'synced',
      playbooks TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  console.log('✅ [DB] Repositories table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create repositories table');
  console.error(error);
  process.exit(1);
}

// Create tokens table for API/Webhook tokens
try {
  console.log('📋 [DB] Creating tokens table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tokenPrefix TEXT NOT NULL,
      tokenFull TEXT NOT NULL,
      scopes TEXT,
      createdAt TEXT,
      lastUsedAt TEXT,
      expiresAt TEXT
    );
  `);
  console.log('✅ [DB] Tokens table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create tokens table');
  console.error(error);
  process.exit(1);
}

// Create environments table
try {
  console.log('📋 [DB] Creating environments table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      variables TEXT,
      secrets TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  console.log('✅ [DB] Environments table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create environments table');
  console.error(error);
  process.exit(1);
}

// Create credentials table
try {
  console.log('📋 [DB] Creating credentials table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      username TEXT,
      sshKey TEXT,
      vaultPassword TEXT,
      sudoPassword TEXT,
      password TEXT,
      secretToken TEXT,
      msClientId TEXT,
      msClientSecret TEXT,
      msTenant TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  console.log('✅ [DB] Credentials table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create credentials table');
  console.error(error);
  process.exit(1);
}

// Create inventories table for file-backed inventory records
try {
  console.log('📋 [DB] Creating inventories table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'static',
      hostCount INTEGER DEFAULT 1,
      inventoryContent TEXT,
      fileName TEXT,
      filePath TEXT,
      credentialId TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  console.log('✅ [DB] Inventories table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create inventories table');
  console.error(error);
  process.exit(1);
}

// Ensure inventories table has all required columns (older DBs may be missing them)
const inventoryCols = ['fileName', 'filePath', 'inventoryContent', 'hostCount', 'credentialId', 'connectionType'];
for (const col of inventoryCols) {
  try { db.exec(`ALTER TABLE inventories ADD COLUMN "${col}" TEXT`); } catch (_) {}
}

// Create full templates table
try {
  console.log('📋 [DB] Creating templates table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'ansible',
      description TEXT DEFAULT '',
      dbType TEXT DEFAULT 'postgresql',
      repositoryId TEXT,
      playbook TEXT DEFAULT '',
      inventoryId TEXT,
      credentialId TEXT,
      environmentId TEXT,
      extraVars TEXT DEFAULT '{}',
      "limit" TEXT DEFAULT 'all',
      tags TEXT DEFAULT '',
      allowCliArgs INTEGER DEFAULT 1,
      totalRuns INTEGER DEFAULT 0,
      lastRunStatus TEXT DEFAULT 'never',
      lastRunAt TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  console.log('✅ [DB] Templates table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create templates table');
  console.error(error);
  process.exit(1);
}

// Add missing columns to templates if upgrading from old schema
const templateCols = ['type','provider','terraformAction','description','dbType','repositoryId','playbook','inventoryId','credentialId','environmentId','extraVars','limit','tags','allowCliArgs','totalRuns','lastRunStatus','lastRunAt','createdAt','updatedAt','folderPath'];
for (const col of templateCols) {
  try { db.exec(`ALTER TABLE templates ADD COLUMN "${col}" TEXT`); } catch (_) {}
}

// Create tasks table
try {
  console.log('📋 [DB] Creating tasks table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      templateId TEXT NOT NULL,
      templateName TEXT NOT NULL,
      type TEXT DEFAULT 'ansible',
      provider TEXT DEFAULT 'aws',
      terraformAction TEXT DEFAULT 'apply',
      status TEXT NOT NULL DEFAULT 'running',
      startedAt TEXT NOT NULL,
      finishedAt TEXT,
      duration TEXT DEFAULT 'running...',
      triggeredBy TEXT DEFAULT 'Operator',
      inventoryName TEXT DEFAULT '',
      playbook TEXT DEFAULT '',
      extraVars TEXT DEFAULT '{}',
      "limit" TEXT DEFAULT 'all',
      hostsStats TEXT DEFAULT '{"ok":0,"changed":0,"unreachable":0,"failed":0,"skipped":0}',
      logs TEXT DEFAULT '[]'
    );
  `);
  console.log('✅ [DB] Tasks table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create tasks table');
  console.error(error);
  process.exit(1);
}

const taskCols = ['type', 'provider', 'terraformAction'];
for (const col of taskCols) {
  try { db.exec(`ALTER TABLE tasks ADD COLUMN "${col}" TEXT`); } catch (_) {}
}

// Create schedules table
try {
  console.log('📋 [DB] Creating schedules table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      templateId TEXT NOT NULL,
      templateName TEXT NOT NULL,
      cron TEXT NOT NULL,
      cronHuman TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      lastRun TEXT,
      nextRun TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  console.log('✅ [DB] Schedules table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create schedules table');
  console.error(error);
  process.exit(1);
}

// Create pending_requests table
try {
  console.log('📋 [DB] Creating pending_requests table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_requests (
      id TEXT PRIMARY KEY,
      clientName TEXT DEFAULT '',
      clientIp TEXT DEFAULT '',
      templateId TEXT NOT NULL,
      templateName TEXT NOT NULL,
      submittedAt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requestedBy TEXT DEFAULT '',
      extraVars TEXT DEFAULT '{}',
      reason TEXT DEFAULT '',
      reviewedBy TEXT,
      reviewedAt TEXT,
      rejectionReason TEXT
    );
  `);
  console.log('✅ [DB] Pending requests table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create pending_requests table');
  console.error(error);
  process.exit(1);
}

// Create database types used by the database operations workspace
try {
  console.log('📋 [DB] Creating database_types table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS database_types (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      description TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  console.log('✅ [DB] Database types table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create database_types table');
  console.error(error);
  process.exit(1);
}

// Ensure new credential columns exist for older DBs
try {
  console.log('🔧 [DB] Ensuring credentials table has all required columns...');
  db.exec('ALTER TABLE credentials ADD COLUMN password TEXT');
} catch (err) {
  if (String(err).includes('duplicate column') || String(err).includes('already exists')) {
    console.log('ℹ️ [DB] credentials.password already present');
  }
}

// Create persisted visual workflows
try {
  console.log('📋 [DB] Creating workflows table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      nodes TEXT NOT NULL DEFAULT '[]',
      edges TEXT NOT NULL DEFAULT '[]',
      totalRuns INTEGER NOT NULL DEFAULT 0,
      lastRunStatus TEXT NOT NULL DEFAULT 'never',
      lastRunAt TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  console.log('✅ [DB] Workflows table ready');
} catch (error) {
  console.error('❌ [DB] Failed to create workflows table');
  console.error(error);
  process.exit(1);
}
try { db.exec("ALTER TABLE workflows ADD COLUMN executionHistory TEXT DEFAULT '[]'"); } catch (err) {}
try { db.exec('ALTER TABLE credentials ADD COLUMN secretToken TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE credentials ADD COLUMN msClientId TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE credentials ADD COLUMN msClientSecret TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE credentials ADD COLUMN msTenant TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE credentials ADD COLUMN domain TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE credentials ADD COLUMN adAuthMethod TEXT'); } catch (err) {}

// Ensure tokens table has expiresAt column (older DBs may not)
try {
  console.log('🔧 [DB] Ensuring tokens.expiresAt column exists...');
  db.exec('ALTER TABLE tokens ADD COLUMN expiresAt TEXT');
  console.log('✅ [DB] tokens.expiresAt column added');
} catch (err) {
  // SQLite will error if column already exists; ignore
  if (String(err).includes('duplicate column') || String(err).includes('already exists')) {
    console.log('ℹ️ [DB] tokens.expiresAt column already present');
  } else {
    console.log('ℹ️ [DB] tokens.expiresAt ensured (no-op)');
  }
}

// Ensure repositories with no lastSync are marked not-synced (created prior to sync checks)
try {
  console.log('🔧 [DB] Normalizing repository statuses...');
  db.exec(`UPDATE repositories SET status = 'not-synced' WHERE lastSync IS NULL;`);
  console.log('✅ [DB] Repository statuses normalized');
} catch (err) {
  console.warn('⚠️ [DB] Could not normalize repository statuses', err.message);
}

// Helper: hash password with scrypt
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// Seed default admin user
try {
  console.log('🌱 [DB] Checking users...');
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  console.log(`👥 [DB] Current users: ${userCount.count}`);

  if (userCount.count === 0) {
    console.log('🌱 [DB] Creating default admin & requester users...');
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, password, role, status, lastLogin)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(
      'usr-admin',
      'Admin',
      config.seed.adminEmail,
      hashPassword(config.seed.adminPassword),
      'Admin',
      'active',
      new Date().toISOString()
    );

    insertUser.run(
      'usr-requester',
      'Developer Requester',
      config.seed.requesterEmail,
      hashPassword(config.seed.requesterPassword),
      'Requester',
      'active',
      new Date().toISOString()
    );

    console.log(`✅ [DB] Admin: ${config.seed.adminEmail}`);
    console.log(`✅ [DB] Requester: ${config.seed.requesterEmail}`);
  } else {
    // Ensure default requester exists even if admin already exists
    try {
      const existingReq = db.prepare('SELECT id FROM users WHERE email = ?').get(config.seed.requesterEmail);
      if (!existingReq) {
        db.prepare(`
          INSERT INTO users (id, name, email, password, role, status, lastLogin)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('usr-requester', 'Developer Requester', config.seed.requesterEmail, hashPassword(config.seed.requesterPassword), 'Requester', 'active', new Date().toISOString());
        console.log(`✅ [DB] Requester created: ${config.seed.requesterEmail}`);
      } else {
        db.prepare(`UPDATE users SET password = ?, role = 'Requester' WHERE email = ?`)
          .run(hashPassword(config.seed.requesterPassword), config.seed.requesterEmail);
      }
    } catch (e) {
      console.error('Error seeding requester:', e);
    }
  }
} catch (error) {
  console.error('❌ [DB] Failed during user initialization');
  console.error(error);
  process.exit(1);
}

console.log('========================================');
console.log('✅ [DB] DATABASE READY');
console.log(`🗄️ ${dbPath}`);
console.log('========================================');

export default db;
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INVENTORY_DIR = path.resolve(__dirname, '../inventories');
const DEFAULT_INVENTORY_CONTENT = '[all]\nlocalhost ansible_connection=local\n';

function ensureInventoryDir() {
  try {
    fs.mkdirSync(INVENTORY_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating inventory directory:', err);
  }
}

function sanitizeFileName(name) {
  const safe = String(name || 'inventory').trim().toLowerCase();
  const slug = safe.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'inventory';
  return slug;
}

function getInventoryFileName(name, id) {
  const base = sanitizeFileName(name);
  return `${base}-${id}.yml`;
}

function resolveInventoryFilePath(fileName) {
  const safeName = String(fileName || '').trim();
  const file = safeName.endsWith('.yml') || safeName.endsWith('.yaml') ? safeName : `${safeName}.yml`;
  return path.join(INVENTORY_DIR, file || 'inventory.yml');
}

function loadInventoryFileContent(fileName) {
  const filePath = resolveInventoryFilePath(fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('Error reading inventory file:', err);
    return null;
  }
}

function saveInventoryFileContent(fileName, content) {
  ensureInventoryDir();
  const safeName = String(fileName || '').trim() || 'inventory.yml';
  const filePath = resolveInventoryFilePath(safeName);
  try {
    fs.writeFileSync(filePath, content || DEFAULT_INVENTORY_CONTENT, 'utf-8');
    return filePath;
  } catch (err) {
    console.error('Error writing inventory file:', err);
    return null;
  }
}

function deleteInventoryFile(fileName) {
  const filePath = resolveInventoryFilePath(fileName);
  if (!fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    console.error('Error deleting inventory file:', err);
  }
}

const countHosts = (content) => {
  const normalized = String(content || DEFAULT_INVENTORY_CONTENT)
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#') && !line.trim().startsWith('['));
  return normalized.length || 1;
};

export const InventoryModel = {
  findAll() {
    const rows = db.prepare('SELECT * FROM inventories ORDER BY rowid DESC').all();
    return rows.map((row) => {
      const currentContent = loadInventoryFileContent(row.fileName) ?? row.inventoryContent ?? DEFAULT_INVENTORY_CONTENT;
      return {
        ...row,
        inventoryContent: currentContent,
        fileName: row.fileName || null,
        filePath: row.filePath || (row.fileName ? path.relative(process.cwd(), resolveInventoryFilePath(row.fileName)) : null)
      };
    });
  },

  findById(id) {
    const row = db.prepare('SELECT * FROM inventories WHERE id = ?').get(id);
    if (!row) return null;
    const currentContent = loadInventoryFileContent(row.fileName) ?? row.inventoryContent ?? DEFAULT_INVENTORY_CONTENT;
    return {
      ...row,
      inventoryContent: currentContent,
      fileName: row.fileName || null,
      filePath: row.filePath || (row.fileName ? path.relative(process.cwd(), resolveInventoryFilePath(row.fileName)) : null)
    };
  },

  create({ name, type = 'static', connectionType = 'ssh', inventoryContent, fileName, credentialId }) {
    const id = `inv-${Date.now()}`;
    const now = new Date().toISOString();
    const normalizedName = String(name || 'inventory').trim() || 'inventory';
    const selectedFileName = fileName || getInventoryFileName(normalizedName, id);
    const content = inventoryContent || DEFAULT_INVENTORY_CONTENT;

    const filePath = type === 'static' ? saveInventoryFileContent(selectedFileName, content) : null;
    if (type === 'static' && !filePath) {
      throw new Error(`Failed to save inventory file for "${normalizedName}"`);
    }
    const relativeFilePath = filePath ? path.relative(process.cwd(), filePath) : null;
    db.prepare(`
      INSERT INTO inventories (id, name, type, connectionType, hostCount, inventoryContent, fileName, filePath, credentialId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      normalizedName,
      type,
      connectionType || 'ssh',
      countHosts(content),
      content,
      type === 'static' ? selectedFileName : null,
      relativeFilePath,
      credentialId || null,
      now,
      now
    );

    return this.findById(id);
  },

  update(id, { name, type, connectionType, inventoryContent, fileName, credentialId }) {
    const existing = this.findById(id);
    if (!existing) return null;

    const nextName = String(name || existing.name || 'inventory').trim() || 'inventory';
    const nextType = type || existing.type || 'static';
    const nextConnType = connectionType || existing.connectionType || 'ssh';
    const nextContent = inventoryContent || existing.inventoryContent || DEFAULT_INVENTORY_CONTENT;
    const nextFileName = fileName || existing.fileName || getInventoryFileName(nextName, id);
    const nextCredentialId = credentialId !== undefined ? credentialId : existing.credentialId;
    const now = new Date().toISOString();

    if (nextType === 'static') {
      const savedPath = saveInventoryFileContent(nextFileName, nextContent);
      db.prepare(`
        UPDATE inventories
        SET name = ?, type = ?, connectionType = ?, hostCount = ?, inventoryContent = ?, fileName = ?, filePath = ?, credentialId = ?, updatedAt = ?
        WHERE id = ?
      `).run(nextName, nextType, nextConnType, countHosts(nextContent), nextContent, nextFileName, savedPath ? path.relative(process.cwd(), savedPath) : existing.filePath, nextCredentialId || null, now, id);
      return this.findById(id);
    }

    db.prepare(`
      UPDATE inventories
      SET name = ?, type = ?, connectionType = ?, hostCount = ?, inventoryContent = ?, fileName = ?, filePath = ?, credentialId = ?, updatedAt = ?
      WHERE id = ?
    `).run(nextName, nextType, nextConnType, countHosts(nextContent), nextContent, null, null, nextCredentialId || null, now, id);
    return this.findById(id);
  },

  delete(id) {
    const inventory = this.findById(id);
    if (inventory && inventory.type === 'static' && inventory.fileName) {
      deleteInventoryFile(inventory.fileName);
    }
    const result = db.prepare('DELETE FROM inventories WHERE id = ?').run(id);
    return result.changes > 0;
  }
};

export default InventoryModel;

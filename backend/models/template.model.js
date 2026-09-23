import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../config/db.js';
import { InventoryModel } from './inventory.model.js';
import { EnvironmentModel } from './environment.model.js';
import { CredentialModel } from './credential.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDir = path.resolve(__dirname, '../templates');

if (!fs.existsSync(templatesDir)) {
  try { fs.mkdirSync(templatesDir, { recursive: true }); } catch (_) {}
}

const syncTemplateFolder = (r) => {
  if (!r) return null;
  const tmpl = {
    ...r,
    type: r.type || 'ansible',
    allowCliArgs: r.allowCliArgs === 1 || r.allowCliArgs === '1',
    totalRuns: parseInt(r.totalRuns || '0', 10)
  };

  try {
    const slug = (tmpl.name || tmpl.id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const folderName = slug || tmpl.id;
    const folderPath = path.join(templatesDir, folderName);

    if (r.folderPath && r.folderPath !== `backend/templates/${folderName}`) {
      try {
        const oldPath = path.resolve(__dirname, '../../', r.folderPath);
        if (fs.existsSync(oldPath) && oldPath !== folderPath) {
          fs.rmSync(oldPath, { recursive: true, force: true });
        }
      } catch (_) {}
    }

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    if (tmpl.type === 'terraform') {
      // 1. Write main.tf only if missing
      const mainTfPath = path.join(folderPath, tmpl.playbook || 'main.tf');
      if (!fs.existsSync(mainTfPath)) {
        const mainTfContent = `# Terraform Configuration for ${tmpl.name}\nterraform {\n  required_version = ">= 1.0.0"\n}\n\nvariable "environment" {\n  type    = string\n  default = "production"\n}\n\nresource "null_resource" "execute_${slug.replace(/-/g, '_')}" {\n  provisioner "local-exec" {\n    command = "echo Executing Terraform template ${tmpl.name}"\n  }\n}\n`;
        const tfDir = path.dirname(mainTfPath);
        if (!fs.existsSync(tfDir)) fs.mkdirSync(tfDir, { recursive: true });
        fs.writeFileSync(mainTfPath, mainTfContent, 'utf8');
      }
    } else {
      // 1. Write playbook.yml only if not present for Ansible templates
      const pbPath = path.join(folderPath, 'playbook.yml');
      if (!fs.existsSync(pbPath)) {
        const playbookContent = `# Ansible Playbook for ${tmpl.name}\n- name: Execute ${tmpl.name} Playbook (${tmpl.dbType || 'postgresql'})\n  hosts: ${tmpl.limit || 'all'}\n  gather_facts: yes\n  tasks:\n    - name: Verify database engine connectivity\n      debug:\n        msg: "Running playbook ${tmpl.playbook || 'playbook.yml'} on {{ inventory_hostname }}"\n`;
        fs.writeFileSync(pbPath, playbookContent, 'utf8');

        if (tmpl.playbook && tmpl.playbook !== 'playbook.yml') {
          const customPath = path.join(folderPath, tmpl.playbook);
          const customDir = path.dirname(customPath);
          if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });
          fs.writeFileSync(customPath, playbookContent, 'utf8');
        }
      }

      // 2. Resolve & Write inventory.ini & inventory.yml
      let invContent = '';
      if (tmpl.inventoryId) {
        try {
          const inv = InventoryModel.findById(tmpl.inventoryId);
          if (inv && inv.inventoryContent) {
            invContent = inv.inventoryContent;
          }
        } catch (_) {}
      }
      if (!invContent) {
        invContent = `[all]\nlocalhost ansible_connection=local\n`;
      }

      fs.writeFileSync(path.join(folderPath, 'inventory.ini'), invContent, 'utf8');
      fs.writeFileSync(path.join(folderPath, 'inventory.yml'), invContent, 'utf8');
    }

    // 3. Resolve & Write extra-vars (vars.yml & vars.json / terraform.tfvars.json)
    let extraVarsObj = {};
    try {
      extraVarsObj = typeof tmpl.extraVars === 'string' ? JSON.parse(tmpl.extraVars) : (tmpl.extraVars || {});
    } catch (_) {}

    fs.writeFileSync(path.join(folderPath, 'vars.json'), JSON.stringify(extraVarsObj, null, 2), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'terraform.tfvars.json'), JSON.stringify(extraVarsObj, null, 2), 'utf8');

    const varsYamlLines = Object.entries(extraVarsObj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    const varsYaml = `# Extra Variables for ${tmpl.name}\n${varsYamlLines.length > 0 ? varsYamlLines.join('\n') : '# No extra variables'}\n`;
    fs.writeFileSync(path.join(folderPath, 'vars.yml'), varsYaml, 'utf8');

    // 4. Resolve & Write Environment (env.json & environment.yml)
    let envObj = { variables: {}, secrets: {} };
    if (tmpl.environmentId) {
      try {
        const envRec = EnvironmentModel.findById(tmpl.environmentId);
        if (envRec) {
          envObj = {
            id: envRec.id,
            name: envRec.name,
            variables: envRec.variables || {},
            secrets: envRec.secrets || {}
          };
        }
      } catch (_) {}
    }

    const envYamlLines = Object.entries(envObj.variables || {}).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    const envYaml = `# Environment Variables for ${tmpl.name}\n${envYamlLines.length > 0 ? envYamlLines.join('\n') : '# No environment variables'}\n`;
    fs.writeFileSync(path.join(folderPath, 'environment.yml'), envYaml, 'utf8');

    // 5. Resolve & Write Credential info (credential.json)
    let credObj = null;
    if (tmpl.credentialId) {
      try {
        const cred = CredentialModel.findById(tmpl.credentialId);
        if (cred) {
          credObj = {
            id: cred.id,
            name: cred.name,
            type: cred.type,
            username: cred.username
          };
        }
      } catch (_) {}
    }

    if (credObj) {
      fs.writeFileSync(path.join(folderPath, 'credential.json'), JSON.stringify(credObj, null, 2), 'utf8');
    }

    // 6. Write env.json manifest
    fs.writeFileSync(path.join(folderPath, 'env.json'), JSON.stringify({
      templateId: tmpl.id,
      templateName: tmpl.name,
      type: tmpl.type,
      dbType: tmpl.dbType,
      limit: tmpl.limit,
      tags: tmpl.tags,
      repositoryId: tmpl.repositoryId,
      inventoryId: tmpl.inventoryId,
      credentialId: tmpl.credentialId,
      environmentId: tmpl.environmentId,
      environment: envObj,
      extraVars: extraVarsObj
    }, null, 2), 'utf8');

    // 7. Write template.json manifest
    fs.writeFileSync(path.join(folderPath, 'template.json'), JSON.stringify(tmpl, null, 2), 'utf8');

    const files = fs.readdirSync(folderPath);
    const relativeFolderPath = `backend/templates/${folderName}`;
    try {
      db.prepare('UPDATE templates SET folderPath = ? WHERE id = ?').run(relativeFolderPath, tmpl.id);
    } catch (_) {}

    return {
      ...tmpl,
      folderPath: relativeFolderPath,
      folderFiles: files
    };
  } catch (err) {
    console.error('Failed to sync template folder:', err);
    return tmpl;
  }
};

export const TemplateModel = {
  findAll: () => {
    const rows = db.prepare('SELECT * FROM templates ORDER BY rowid DESC').all();
    return rows.map((r) => syncTemplateFolder(r));
  },

  findById: (id) => {
    const r = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!r) return null;
    return syncTemplateFolder(r);
  },

  create: (data) => {
    const id = `tmpl-${Date.now()}`;
    const now = new Date().toISOString();
    const slug = (data.name || id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const folderPath = `backend/templates/${slug || id}`;

    const stmt = db.prepare(`
      INSERT INTO templates (id, name, type, provider, terraformAction, description, dbType, repositoryId, playbook, inventoryId, credentialId, environmentId, extraVars, "limit", tags, allowCliArgs, totalRuns, lastRunStatus, lastRunAt, createdAt, updatedAt, folderPath)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'never', NULL, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.name,
      data.type || 'ansible',
      data.provider || 'aws',
      data.terraformAction || 'apply',
      data.description || '',
      data.dbType || 'postgresql',
      data.repositoryId || null,
      data.playbook || '',
      data.inventoryId || null,
      data.credentialId || null,
      data.environmentId || null,
      data.extraVars || '{}',
      data.limit || 'all',
      data.tags || '',
      data.allowCliArgs ? 1 : 0,
      now,
      now,
      folderPath
    );
    const created = TemplateModel.findById(id);
    return created;
  },

  update: (id, data) => {
    const fields = [];
    const values = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
    if (data.provider !== undefined) { fields.push('provider = ?'); values.push(data.provider); }
    if (data.terraformAction !== undefined) { fields.push('terraformAction = ?'); values.push(data.terraformAction); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.dbType !== undefined) { fields.push('dbType = ?'); values.push(data.dbType); }
    if (data.repositoryId !== undefined) { fields.push('repositoryId = ?'); values.push(data.repositoryId); }
    if (data.playbook !== undefined) { fields.push('playbook = ?'); values.push(data.playbook); }
    if (data.inventoryId !== undefined) { fields.push('inventoryId = ?'); values.push(data.inventoryId); }
    if (data.credentialId !== undefined) { fields.push('credentialId = ?'); values.push(data.credentialId); }
    if (data.environmentId !== undefined) { fields.push('environmentId = ?'); values.push(data.environmentId); }
    if (data.extraVars !== undefined) { fields.push('extraVars = ?'); values.push(data.extraVars); }
    if (data.limit !== undefined) { fields.push('"limit" = ?'); values.push(data.limit); }
    if (data.tags !== undefined) { fields.push('tags = ?'); values.push(data.tags); }
    if (data.allowCliArgs !== undefined) { fields.push('allowCliArgs = ?'); values.push(data.allowCliArgs ? 1 : 0); }

    if (fields.length === 0) return TemplateModel.findById(id);

    fields.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.prepare(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return TemplateModel.findById(id);
  },

  incrementRuns: (id, status) => {
    const now = new Date().toISOString();
    db.prepare(`UPDATE templates SET totalRuns = totalRuns + 1, lastRunStatus = ?, lastRunAt = ?, updatedAt = ? WHERE id = ?`).run(status, now, now, id);
  },

  delete: (id) => {
    try {
      const tmpl = db.prepare('SELECT folderPath FROM templates WHERE id = ?').get(id);
      if (tmpl && tmpl.folderPath) {
        const fullPath = path.resolve(__dirname, '../../', tmpl.folderPath);
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      }
    } catch (_) {}
    const info = db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    return info.changes > 0;
  }
};

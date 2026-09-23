import db from '../config/db.js';

export const CredentialModel = {
  findAll: () => {
    const rows = db.prepare('SELECT * FROM credentials ORDER BY rowid DESC').all();
    return rows;
  },

  findById: (id) => {
    const r = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id);
    if (!r) return null;
    return r;
  },

  create: (data) => {
    const id = `cred-${Date.now()}`;
    const name = data.name;
    const type = data.type || 'ssh_key';
    const username = data.username || null;
    const sshKey = data.sshKey || null;
    const vaultPassword = data.vaultPassword || null;
    const sudoPassword = data.sudoPassword || null;
    const password = data.password || null;
    const secretToken = data.secretToken || null;
    const msClientId = data.msClientId || null;
    const msClientSecret = data.msClientSecret || null;
    const msTenant = data.msTenant || null;
    const domain = data.domain || null;
    const adAuthMethod = data.adAuthMethod || 'ntlm';
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO credentials (id, name, type, username, sshKey, vaultPassword, sudoPassword, password, secretToken, msClientId, msClientSecret, msTenant, domain, adAuthMethod, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, name, type, username, sshKey, vaultPassword, sudoPassword, password, secretToken, msClientId, msClientSecret, msTenant, domain, adAuthMethod, now, now);
    return CredentialModel.findById(id);
  },

  update: (id, data) => {
    const existing = CredentialModel.findById(id);
    if (!existing) return null;

    const next = {
      name: data.name ?? existing.name,
      type: data.type ?? existing.type,
      username: data.username ?? existing.username,
      sshKey: data.sshKey ?? existing.sshKey,
      vaultPassword: data.vaultPassword ?? existing.vaultPassword,
      sudoPassword: data.sudoPassword ?? existing.sudoPassword,
      password: data.password ?? existing.password,
      secretToken: data.secretToken ?? existing.secretToken,
      msClientId: data.msClientId ?? existing.msClientId,
      msClientSecret: data.msClientSecret ?? existing.msClientSecret,
      msTenant: data.msTenant ?? existing.msTenant,
      domain: data.domain ?? existing.domain,
      adAuthMethod: data.adAuthMethod ?? existing.adAuthMethod ?? 'ntlm',
      updatedAt: new Date().toISOString()
    };

    db.prepare(`
      UPDATE credentials
      SET name = ?, type = ?, username = ?, sshKey = ?, vaultPassword = ?, sudoPassword = ?, password = ?, secretToken = ?, msClientId = ?, msClientSecret = ?, msTenant = ?, domain = ?, adAuthMethod = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      next.name,
      next.type,
      next.username,
      next.sshKey,
      next.vaultPassword,
      next.sudoPassword,
      next.password,
      next.secretToken,
      next.msClientId,
      next.msClientSecret,
      next.msTenant,
      next.domain,
      next.adAuthMethod,
      next.updatedAt,
      id
    );

    return CredentialModel.findById(id);
  },

  delete: (id) => {
    const info = db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
    return info.changes > 0;
  }
};

export default CredentialModel;

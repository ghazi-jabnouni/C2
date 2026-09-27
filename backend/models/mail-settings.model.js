import db from '../config/db.js';

function envSettings() {
  return {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1',
    username: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASS || '',
    fromAddress: process.env.SMTP_FROM || process.env.SMTP_USER || ''
  };
}

export const MailSettingsModel = {
  getTransportSettings() {
    const saved = db.prepare('SELECT * FROM mail_settings WHERE id = 1').get();
    if (!saved) return envSettings();
    return {
      host: saved.host,
      port: Number(saved.port),
      secure: Boolean(saved.secure),
      username: saved.username,
      password: saved.password || process.env.SMTP_PASS || '',
      fromAddress: saved.fromAddress || saved.username
    };
  },

  getPublicSettings() {
    const settings = this.getTransportSettings();
    return {
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      username: settings.username,
      fromAddress: settings.fromAddress,
      passwordConfigured: Boolean(settings.password)
    };
  },

  save(data) {
    const current = this.getTransportSettings();
    const settings = {
      host: String(data.host || '').trim(),
      port: Number(data.port || 587),
      secure: Boolean(data.secure),
      username: String(data.username || '').trim(),
      password: typeof data.password === 'string' && data.password.length > 0 ? data.password : current.password,
      fromAddress: String(data.fromAddress || data.username || '').trim()
    };
    const updatedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO mail_settings (id, host, port, secure, username, password, fromAddress, updatedAt)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET host = excluded.host, port = excluded.port,
        secure = excluded.secure, username = excluded.username, password = excluded.password,
        fromAddress = excluded.fromAddress, updatedAt = excluded.updatedAt
    `).run(
      settings.host,
      settings.port,
      settings.secure ? 1 : 0,
      settings.username,
      settings.password,
      settings.fromAddress,
      updatedAt
    );
    return this.getPublicSettings();
  }
};

export default MailSettingsModel;
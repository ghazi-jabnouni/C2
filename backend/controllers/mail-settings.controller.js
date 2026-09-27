import nodemailer from 'nodemailer';
import { MailSettingsModel } from '../models/mail-settings.model.js';

function isAdmin(req, res) {
  if (req.user?.role === 'Admin') return true;
  res.status(403).json({ error: 'Administrator access is required to manage mail settings.' });
  return false;
}

function createTransport(settings) {
  if (!settings.host) throw new Error('Configure an SMTP host before sending mail.');
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.username ? { user: settings.username, pass: settings.password } : undefined
  });
}

export const MailSettingsController = {
  get: (req, res) => {
    if (!isAdmin(req, res)) return;
    res.json(MailSettingsModel.getPublicSettings());
  },

  save: (req, res) => {
    if (!isAdmin(req, res)) return;
    const { host, port, username, password } = req.body || {};
    const numericPort = Number(port);
    if (!String(host || '').trim() || !Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
      return res.status(400).json({ error: 'A valid SMTP host and port are required.' });
    }
    const current = MailSettingsModel.getTransportSettings();
    if (username && !(password || current.password)) {
      return res.status(400).json({ error: 'Enter the SMTP password before saving this account.' });
    }
    res.json(MailSettingsModel.save(req.body));
  },

  sendTest: async (req, res) => {
    if (!isAdmin(req, res)) return;
    const recipient = String(req.body?.to || '').trim();
    if (!recipient) return res.status(400).json({ error: 'A test recipient email address is required.' });
    try {
      const settings = MailSettingsModel.getTransportSettings();
      if (!settings.fromAddress) throw new Error('Configure an SMTP sender address before sending mail.');
      const transport = createTransport(settings);
      await transport.verify();
      const result = await transport.sendMail({
        from: settings.fromAddress,
        to: recipient,
        subject: 'Automaton Platform SMTP test',
        text: 'SMTP is configured and the test email was delivered by Automaton Platform.'
      });
      res.json({ message: 'Test email sent.', messageId: result.messageId });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }
};

export default MailSettingsController;
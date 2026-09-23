export const config = {
  // ── Server ──────────────────────────────────────────────
  port:       process.env.PORT       || 5000,
  env:        process.env.NODE_ENV   || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // ── Database ─────────────────────────────────────────────
  database: {
    // Resolved in db.js; override with DB_PATH env var
    path: process.env.DB_PATH || null,
    filename: 'sqlite.db'
  },

  // ── Seed accounts ────────────────────────────────────────
  seed: {
    adminEmail:        process.env.ADMIN_EMAIL        || 'admin@automaton.local',
    adminPassword:     process.env.ADMIN_PASSWORD     || 'admin123',
    requesterEmail:    process.env.REQUESTER_EMAIL    || 'requester@c2platform.local',
    requesterPassword: process.env.REQUESTER_PASSWORD || 'req123',
  },

  // ── Security ─────────────────────────────────────────────
  sessionTtlSeconds: parseInt(process.env.SESSION_TTL_SECONDS || '28800', 10),

  // ── Ansible ──────────────────────────────────────────────
  ansible: {
    bin:        process.env.ANSIBLE_PLAYBOOK_BIN || 'ansible-playbook',
    jobTimeout: parseInt(process.env.ANSIBLE_JOB_TIMEOUT || '3600', 10),
  },

  // ── Terraform ────────────────────────────────────────────
  terraform: {
    bin: process.env.TERRAFORM_BIN || 'terraform',
  },
};


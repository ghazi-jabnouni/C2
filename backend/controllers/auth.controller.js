import crypto from 'node:crypto';
import { UserModel } from '../models/user.model.js';
import { TokenModel } from '../models/token.model.js';

// Simple in-memory session store (for production use Redis/JWT)
const sessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getAuthForToken(token) {
  const session = token ? sessions.get(token) : null;
  if (session) {
    const user = UserModel.findById(session.userId);
    return user ? { user, type: 'session', scopes: [] } : null;
  }

  const apiToken = token ? TokenModel.findByFull(token) : null;
  if (!apiToken) return null;
  if (apiToken.expiresAt && new Date(apiToken.expiresAt).getTime() < Date.now()) return null;
  let scopes = [];
  try { scopes = JSON.parse(apiToken.scopes || '[]'); } catch (_) {}
  TokenModel.touch(apiToken.id);
  return {
    user: { id: `api-${apiToken.id}`, name: apiToken.name || 'API Token', email: '', role: 'Operator', status: 'active' },
    type: 'api-token',
    scopes: Array.isArray(scopes) ? scopes : []
  };
}

function apiTokenScopesForRequest(req) {
  const route = `${req.baseUrl || ''}${req.path || ''}`;
  if (/^\/api\/workflows\/[^/]+\/run$/.test(route) && req.method === 'POST') return ['workflows:run'];
  if (/^\/api\/workflows\/[^/]+\/runs\/[^/]+\/approval\/[^/]+$/.test(route) && req.method === 'POST') return ['workflows:approve'];
  if (/^\/api\/workflows\/[^/]+\/runs\/[^/]+$/.test(route) && req.method === 'GET') return ['workflows:read', 'workflows:run'];
  if (route === '/api/workflows' && req.method === 'GET') return ['workflows:read'];
  if (/^\/api\/templates(?:\/[^/]+)?$/.test(route) && req.method === 'GET') return ['templates:read'];
  if (/^\/api\/templates\/[^/]+\/run$/.test(route) && req.method === 'POST') return ['tasks:run', 'tasks:create'];
  if (/^\/api\/tasks(?:\/[^/]+)?$/.test(route) && req.method === 'GET') return ['tasks:read'];
  return [];
}

export const AuthController = {
  getUserForToken: (token) => getAuthForToken(token)?.user || null,
  getAuthForToken,

  login: (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = UserModel.findByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ error: 'Account is deactivated' });
      }

      const valid = UserModel.verifyPassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Update last login
      UserModel.updateLastLogin(user.id);

      // Generate session token
      const token = generateToken();
      sessions.set(token, {
        userId: user.id,
        createdAt: Date.now()
      });

      // Return user data (without password)
      const { password: _, ...safeUser } = user;

      res.json({
        token,
        user: safeUser
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: err.message });
    }
  },

  logout: (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      sessions.delete(token);
    }
    res.json({ success: true, message: 'Logged out' });
  },

  me: (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const session = sessions.get(token);
      if (!session) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const user = UserModel.findById(session.userId);
      if (!user) {
        sessions.delete(token);
        return res.status(401).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Middleware: attach to protected routes
  requireAuth: (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const auth = getAuthForToken(token);
    if (!auth) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (auth.type === 'api-token') {
      const requiredScopes = apiTokenScopesForRequest(req);
      if (!requiredScopes.length || !requiredScopes.some((scope) => auth.scopes.includes(scope))) {
        return res.status(403).json({ error: `API token lacks required scope: ${requiredScopes.join(' or ') || 'endpoint access denied'}.` });
      }
    }

    req.user = auth.user;
    req.authType = auth.type;
    req.apiTokenScopes = auth.scopes;
    next();
  }
};

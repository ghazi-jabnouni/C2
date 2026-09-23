import crypto from 'node:crypto';
import { UserModel } from '../models/user.model.js';

// Simple in-memory session store (for production use Redis/JWT)
const sessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export const AuthController = {
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

    const session = sessions.get(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = UserModel.findById(session.userId);
    if (!user) {
      sessions.delete(token);
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  }
};

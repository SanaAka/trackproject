import { verifySession } from '../services/auth-service.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.trackpos_session;

  if (!token) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    req.session = verifySession(token);
    return next();
  } catch {
    return res.status(401).json({ error: 'Not logged in' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.session?.role !== 'ADMIN') return res.status(403).json({ error: 'Admin role required' });
  return next();
}
import { z } from 'zod';
import { login, SESSION_MAX_AGE_MS, verifySession } from '../services/auth-service.js';

const loginSchema = z.object({ employeeId: z.string().trim().min(1).max(64), pin: z.string().min(4).max(32) });

export function authRoutes({ prisma }) {
  return async (req, res, next) => {
    try {
      if (req.method === 'POST' && req.path === '/login') {
        const input = loginSchema.parse(req.body);
        const result = await login({ prisma, ...input });
        if (!result.ok) return res.status(result.reason === 'LOCKED' ? 423 : 401).json({ error: result.reason === 'LOCKED' ? 'Account temporarily locked' : 'Invalid credentials' });
        res.cookie('trackpos_session', result.token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: SESSION_MAX_AGE_MS, path: '/' });
        return res.json({ staff: { id: result.staff.id, employeeId: result.staff.employeeId, name: result.staff.name, role: result.staff.role, branch: result.staff.branch } });
      }
      if (req.method === 'POST' && req.path === '/logout') {
        try { verifySession(req.cookies?.trackpos_session); } catch { return res.status(401).json({ error: 'Not logged in' }); }
        res.clearCookie('trackpos_session', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
        return res.status(204).end();
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
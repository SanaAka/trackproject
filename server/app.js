import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { authRoutes } from './routes/auth-routes.js';
import { adminRoutes } from './routes/admin-routes.js';
import { requireAdmin, requireAuth } from './middleware/auth.js';

export function createApp({ prisma }) {
  const app = express();
  app.use(helmet());
  app.use((req, res, next) => {
    const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
    const allowedOrigins = new Set([origin, 'http://localhost:5173', 'http://127.0.0.1:5173']);
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed' });
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }), authRoutes({ prisma }));
  app.use('/api/auth/me', requireAuth, (req, res) => res.json({ session: req.session }));
  app.use('/api/admin', requireAuth, requireAdmin, adminRoutes({ prisma }));
  app.use('/api', requireAuth, (req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ZodError) return res.status(400).json({ error: 'Invalid input', details: error.issues });
    if (error.code === 'P2002') return res.status(409).json({ error: 'Duplicate value' });
    if (error.code === 'P2025') return res.status(404).json({ error: 'Record not found' });
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
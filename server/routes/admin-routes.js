import { z } from 'zod';
import { createBranch, createStaff, listBranches, listStaff, resetPin, setStaffActive } from '../services/admin-service.js';

const branchSchema = z.object({ name: z.string().trim().min(1).max(100) });
const staffSchema = z.object({ employeeId: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(120), branchId: z.coerce.number().int().positive(), role: z.enum(['STAFF', 'ADMIN']).default('STAFF'), pin: z.string().min(4).max(32) });
const pinSchema = z.object({ pin: z.string().min(4).max(32) });
const activeSchema = z.object({ active: z.boolean() });

export function adminRoutes({ prisma }) {
  return async (req, res, next) => {
    try {
      if (req.method === 'GET' && req.path === '/branches') return res.json({ branches: await listBranches(prisma) });
      if (req.method === 'POST' && req.path === '/branches') return res.status(201).json({ branch: await createBranch(prisma, branchSchema.parse(req.body).name, req.session.sub) });
      if (req.method === 'GET' && req.path === '/staff') return res.json({ staff: await listStaff(prisma) });
      if (req.method === 'POST' && req.path === '/staff') return res.status(201).json({ staff: await createStaff(prisma, staffSchema.parse(req.body), req.session.sub) });
      const staffId = Number(req.params.staffId);
      if (req.method === 'POST' && req.path === `/staff/${req.params.staffId}/pin`) return res.json({ staff: await resetPin(prisma, staffId, pinSchema.parse(req.body).pin, req.session.sub) });
      if (req.method === 'PATCH' && req.path === `/staff/${req.params.staffId}/active`) return res.json({ staff: await setStaffActive(prisma, staffId, activeSchema.parse(req.body).active, req.session.sub) });
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
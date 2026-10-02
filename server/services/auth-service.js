import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

function tokenSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return secret;
}

export function signSession(staff) {
  return jwt.sign({ sub: String(staff.id), employeeId: staff.employeeId, role: staff.role }, tokenSecret(), { expiresIn: '8h' });
}

export function verifySession(token) {
  return jwt.verify(token, tokenSecret());
}

export async function login({ prisma, employeeId, pin, now = new Date() }) {
  const staff = await prisma.staff.findUnique({ where: { employeeId }, include: { branch: true } });
  if (!staff || !staff.active) return { ok: false, reason: 'INVALID_CREDENTIALS' };
  if (staff.lockedUntil && staff.lockedUntil > now) return { ok: false, reason: 'LOCKED' };

  const valid = await bcrypt.compare(pin, staff.pinHash);
  if (!valid) {
    const failedAttempts = staff.failedAttempts + 1;
    const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + 15 * 60 * 1000) : null;
    await prisma.staff.update({ where: { id: staff.id }, data: { failedAttempts, lockedUntil } });
    return { ok: false, reason: lockedUntil ? 'LOCKED' : 'INVALID_CREDENTIALS' };
  }

  const updated = await prisma.staff.update({
    where: { id: staff.id },
    data: { failedAttempts: 0, lockedUntil: null },
    include: { branch: true }
  });
  return { ok: true, staff: updated, token: signSession(updated) };
}

export async function seedAdmin({ prisma, employeeId, name, pin, branchName }) {
  if (!employeeId || !name || !pin || !branchName) throw new Error('ADMIN_EMPLOYEE_ID, ADMIN_NAME, ADMIN_PIN and HOME_BRANCH are required');
  const branch = await prisma.branch.upsert({ where: { name: branchName }, update: {}, create: { name: branchName } });
  const pinHash = await bcrypt.hash(pin, 12);
  return prisma.staff.upsert({
    where: { employeeId },
    update: { name, branchId: branch.id, role: 'ADMIN', active: true, pinHash },
    create: { employeeId, name, branchId: branch.id, role: 'ADMIN', pinHash }
  });
}
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import { login, signSession, verifySession } from '../server/services/auth-service.js';

process.env.JWT_SECRET = 'phase-two-test-secret';

function fakePrisma(staff) {
  return {
    staff: {
      findUnique: async () => ({ ...staff, branch: { id: staff.branchId, name: 'Branch 001' } }),
      update: async ({ data }) => {
        Object.assign(staff, data);
        return { ...staff, branch: { id: staff.branchId, name: 'Branch 001' } };
      }
    }
  };
}

describe('authentication service', () => {
  let staff;

  beforeEach(async () => {
    staff = { id: 1, employeeId: 'E001', name: 'Ada', branchId: 1, role: 'ADMIN', active: true, failedAttempts: 0, lockedUntil: null, pinHash: await bcrypt.hash('1234', 4) };
  });

  it('creates and verifies an eight-hour session token', () => {
    const token = signSession(staff);
    expect(verifySession(token)).toMatchObject({ sub: '1', employeeId: 'E001', role: 'ADMIN' });
  });

  it('resets failed attempts after a valid login', async () => {
    staff.failedAttempts = 2;
    const result = await login({ prisma: fakePrisma(staff), employeeId: 'E001', pin: '1234' });
    expect(result).toMatchObject({ ok: true, staff: { employeeId: 'E001', role: 'ADMIN' } });
    expect(staff.failedAttempts).toBe(0);
    expect(staff.lockedUntil).toBeNull();
  });

  it('locks the account on the fifth failed attempt', async () => {
    const prisma = fakePrisma(staff);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await login({ prisma, employeeId: 'E001', pin: 'wrong', now: new Date('2026-10-02T00:00:00Z') });
      expect(result.reason).toBe(attempt === 5 ? 'LOCKED' : 'INVALID_CREDENTIALS');
    }
    expect(staff.failedAttempts).toBe(5);
    expect(staff.lockedUntil).toEqual(new Date('2026-10-02T00:15:00Z'));
  });
});
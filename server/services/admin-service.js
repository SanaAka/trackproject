import bcrypt from 'bcrypt';

export async function listBranches(prisma) {
  return prisma.branch.findMany({ orderBy: { name: 'asc' } });
}

export async function createBranch(prisma, name, actorId) {
  const branch = await prisma.branch.create({ data: { name } });
  await prisma.auditLog.create({ data: { who: Number(actorId), action: 'CREATE', entity: `branch:${branch.id}`, after: JSON.stringify(branch) } });
  return branch;
}

export async function listStaff(prisma) {
  return prisma.staff.findMany({
    orderBy: { employeeId: 'asc' },
    select: { id: true, employeeId: true, name: true, role: true, active: true, failedAttempts: true, lockedUntil: true, branch: { select: { id: true, name: true } } }
  });
}

export async function createStaff(prisma, input, actorId) {
  const pinHash = await bcrypt.hash(input.pin, 12);
  const staff = await prisma.staff.create({
    data: { employeeId: input.employeeId, name: input.name, branchId: input.branchId, role: input.role, pinHash },
    select: { id: true, employeeId: true, name: true, role: true, active: true, branch: { select: { id: true, name: true } } }
  });
  await prisma.auditLog.create({ data: { who: Number(actorId), action: 'CREATE', entity: `staff:${staff.id}`, after: JSON.stringify(staff) } });
  return staff;
}

export async function resetPin(prisma, staffId, pin, actorId) {
  const pinHash = await bcrypt.hash(pin, 12);
  const staff = await prisma.staff.update({ where: { id: staffId }, data: { pinHash, failedAttempts: 0, lockedUntil: null }, select: { id: true, employeeId: true } });
  await prisma.auditLog.create({ data: { who: Number(actorId), action: 'RESET_PIN', entity: `staff:${staff.id}`, after: JSON.stringify({ employeeId: staff.employeeId }) } });
  return staff;
}

export async function setStaffActive(prisma, staffId, active, actorId) {
  const staff = await prisma.staff.update({ where: { id: staffId }, data: { active }, select: { id: true, employeeId: true, active: true } });
  await prisma.auditLog.create({ data: { who: Number(actorId), action: active ? 'ACTIVATE' : 'DEACTIVATE', entity: `staff:${staff.id}`, after: JSON.stringify(staff) } });
  return staff;
}
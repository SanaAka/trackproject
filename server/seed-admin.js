import 'dotenv/config';
import { prisma } from './db.js';
import { seedAdmin } from './services/auth-service.js';

try {
  const staff = await seedAdmin({ prisma, employeeId: process.env.ADMIN_EMPLOYEE_ID, name: process.env.ADMIN_NAME, pin: process.env.ADMIN_PIN, branchName: process.env.HOME_BRANCH ?? 'Branch 001' });
  console.log(`Seeded admin ${staff.employeeId}`);
} finally {
  await prisma.$disconnect();
}
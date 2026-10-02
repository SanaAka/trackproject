import fs from 'node:fs/promises';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import { importWorkbook } from './services/import-service.js';

const file = process.argv[2];
if (!file) throw new Error('Usage: npm run import -- /path/to/workbook.xlsx [--apply] [--confirm]');
const prisma = new PrismaClient();
try {
  const report = await importWorkbook({ input: await fs.readFile(file), prisma, dryRun: !process.argv.includes('--apply'), confirm: process.argv.includes('--confirm'), homeBranch: process.env.HOME_BRANCH ?? 'Branch 001' });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await prisma.$disconnect();
}
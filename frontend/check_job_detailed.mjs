import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  // Get most recent job
  const job = await prisma.job.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!job) {
    console.log('❌ No jobs found');
    process.exit(0);
  }

  console.log(`\n━━━ MOST RECENT JOB ━━━`);
  console.log(`ID: ${job.id}`);
  console.log(`Status: ${job.status}`);
  console.log(`Progress: ${job.progress}%`);
  console.log(`Created: ${job.createdAt.toISOString()}`);

  console.log('\n📋 ALL JOB FIELDS:');
  console.log(JSON.stringify(job, null, 2));

  await prisma.$disconnect();
} catch (error) {
  console.error('Error:', error.message);
  await prisma.$disconnect();
  process.exit(1);
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  // Get most recent jobs
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      chat: {
        select: { id: true, title: true }
      }
    }
  });

  if (jobs.length === 0) {
    console.log('❌ No jobs found');
    process.exit(0);
  }

  console.log(`=== FOUND ${jobs.length} RECENT JOBS ===\n`);

  for (const job of jobs) {
    console.log(`\n━━━ JOB ${job.id} ━━━`);
    console.log(`Status: ${job.status}`);
    console.log(`Progress: ${job.progress}%`);
    console.log(`Chat: ${job.chat?.title || 'Untitled'}`);
    console.log(`Created: ${job.createdAt.toISOString()}`);

    // Check request data for avatar_id and product_images
    if (job.request && typeof job.request === 'object') {
      console.log('\n📝 REQUEST DATA:');
      if ('avatar_id' in job.request) {
        console.log(`  avatar_id: ${job.request.avatar_id || 'NOT PROVIDED'}`);
      } else {
        console.log(`  avatar_id: MISSING FROM REQUEST`);
      }

      if ('product_name' in job.request) {
        console.log(`  product_name: ${job.request.product_name || 'NOT PROVIDED'}`);
      }

      if ('product_images' in job.request) {
        const images = job.request.product_images;
        if (Array.isArray(images) && images.length > 0) {
          console.log(`  product_images: ${images.length} image(s)`);
          images.forEach((img, i) => {
            console.log(`    ${i + 1}. ${img}`);
          });
        } else {
          console.log(`  product_images: NOT PROVIDED`);
        }
      } else {
        console.log(`  product_images: MISSING FROM REQUEST`);
      }

      if ('prompt' in job.request) {
        const prompt = job.request.prompt;
        console.log(`  prompt: ${typeof prompt === 'string' ? prompt.substring(0, 100) : 'N/A'}...`);
      }
    }

    // Check storyboard data
    if (job.storyboard) {
      console.log('\n🎬 STORYBOARD:');
      const storyboard = typeof job.storyboard === 'string'
        ? JSON.parse(job.storyboard)
        : job.storyboard;

      if (Array.isArray(storyboard)) {
        console.log(`  ${storyboard.length} scene(s) generated`);
      }
    } else {
      console.log('\n⚠️  No storyboard data yet');
    }
  }

  await prisma.$disconnect();
} catch (error) {
  console.error('Error:', error.message);
  await prisma.$disconnect();
  process.exit(1);
}

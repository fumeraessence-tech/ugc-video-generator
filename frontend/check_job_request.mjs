import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  // Get most recent job with all metadata
  const job = await prisma.job.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!job) {
    console.log('❌ No jobs found');
    process.exit(0);
  }

  console.log(`\n━━━ JOB ${job.id} ━━━`);
  console.log(`Status: ${job.status}`);
  console.log(`Created: ${job.createdAt.toISOString()}`);

  console.log('\n📦 KEY GENERATION CONTROLS:');
  console.log(`  avatarId: ${job.avatarId || '❌ NOT SET'}`);
  console.log(`  productName: ${job.productName || '❌ NOT SET'}`);
  console.log(`  productImages: ${job.productImages?.length > 0 ? job.productImages.join(', ') : '❌ EMPTY ARRAY'}`);
  console.log(`  backgroundSetting: ${job.backgroundSetting || 'NOT SET'}`);
  console.log(`  platform: ${job.platform || 'NOT SET'}`);

  console.log('\n📋 FULL METADATA:');
  if (job.metadata) {
    const meta = typeof job.metadata === 'string' ? JSON.parse(job.metadata) : job.metadata;
    console.log(JSON.stringify(meta, null, 2));
  } else {
    console.log('  No metadata stored');
  }

  // Check if there's a corresponding message with settings
  const chat = await prisma.chat.findUnique({
    where: { id: job.chatId },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          role: true,
          content: true,
          metadata: true,
          createdAt: true,
        }
      }
    }
  });

  if (chat?.messages) {
    console.log('\n📝 RECENT MESSAGES IN CHAT:');
    chat.messages.forEach((msg, i) => {
      console.log(`\n  [${i + 1}] ${msg.role} - ${msg.createdAt.toISOString()}`);
      console.log(`      Content: ${msg.content.substring(0, 100)}...`);
      if (msg.metadata) {
        console.log(`      Has metadata: YES`);
        const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
        if (meta.productName) console.log(`      - productName: ${meta.productName}`);
        if (meta.productImages) console.log(`      - productImages: ${JSON.stringify(meta.productImages)}`);
        if (meta.selectedAvatarId) console.log(`      - selectedAvatarId: ${meta.selectedAvatarId}`);
      }
    });
  }

  await prisma.$disconnect();
} catch (error) {
  console.error('Error:', error.message);
  await prisma.$disconnect();
  process.exit(1);
}

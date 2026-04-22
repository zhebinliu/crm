const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const tasks = await prisma.activity.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('Last 5 activities:');
  tasks.forEach(t => {
    console.log(`- ID: ${t.id}, Subject: "${t.subject}", TargetID: ${t.targetId}, CreatedAt: ${t.createdAt}`);
  });
  await prisma.$disconnect();
}

check();

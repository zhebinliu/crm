import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const objects = await prisma.objectDef.findMany({
    select: { apiName: true, label: true }
  });
  console.log('Database Objects:', JSON.stringify(objects, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());

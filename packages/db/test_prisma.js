const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://tokenwave:tokenwave@localhost:5432/tokenwave_crm'
    }
  }
});

async function main() {
  console.log('Testing Prisma lead create...');
  try {
    const lead = await prisma.lead.create({
      data: {
        tenantId: 'demo',
        ownerId: 'demo',
        lastName: 'Test',
        company: 'Test Company',
      }
    });
    console.log('Success:', lead);
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Code:', e.code);
  } finally {
    await prisma.$disconnect();
  }
}
main();

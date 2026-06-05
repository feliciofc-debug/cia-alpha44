import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.tenant.upsert({
    where: { slug: "default" },
    create: {
      slug: "default",
      nome: "CIA / Alpha 44 (tenant padrão)",
    },
    update: {},
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

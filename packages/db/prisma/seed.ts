import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Parser legado — importa CIA_USERS para a tabela Usuario (uma vez na migração). */
function parseCiaUsers(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  const texto = raw?.trim();
  if (!texto) return map;

  for (const entry of texto.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0) continue;
    const email = trimmed.slice(0, sep).trim().toLowerCase();
    const hash = trimmed.slice(sep + 1).trim();
    if (email && hash && !hash.includes("SENHA") && !hash.includes("SEGREDO")) {
      map.set(email, hash);
    }
  }
  return map;
}

const ADMIN_EMAIL = "feliciofc@gmail.com";

async function seedUsuarios() {
  const legado = parseCiaUsers(process.env.CIA_USERS);
  if (legado.size === 0) {
    console.log("[seed] CIA_USERS vazio — nenhum usuário legado importado.");
    return;
  }

  for (const [email, senhaHash] of legado) {
    const role = email === ADMIN_EMAIL ? "admin" : "operador";
    await prisma.usuario.upsert({
      where: { email },
      create: {
        email,
        senhaHash,
        nome: email.split("@")[0] || email,
        status: "aprovado",
        role,
        aprovadoEm: new Date(),
        aprovadoPor: "seed-cia-users",
      },
      update: {
        senhaHash,
        status: "aprovado",
        role,
      },
    });
    console.log(`[seed] usuário importado: ${email} (${role})`);
  }
}

async function main() {
  await prisma.tenant.upsert({
    where: { slug: "default" },
    create: {
      slug: "default",
      nome: "CIA / Alpha 44 (tenant padrão)",
    },
    update: {},
  });

  await seedUsuarios();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

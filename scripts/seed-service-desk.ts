import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { demoIdentities, demoArticles, demoTickets, demoConversations } =
    await import("../src/server/data/service-desk-demo");
  if (!process.argv.includes("--apply")) {
    console.log(
      "Dry run: 2 funcionários, 1 analista, 6 artigos, 6 chamados e 4 conversas. Nada gravado. Use --apply e NEXO_DEMO_PASSWORD somente em ambiente de demonstração.",
    );
    return;
  }
  const password = process.env.NEXO_DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Defina NEXO_DEMO_PASSWORD com pelo menos 12 caracteres.");
  const { getAdminAuth } =
    await import("../src/server/lib/firebase/firebase-admin");
  const { database } = await import("../src/server/lib/mongodb");
  const db = await database();
  try {
    const auth = getAdminAuth();
    // Preflight all fixed identities before any write. Never adopt an existing
    // account or alter its password/claims based only on its email/UID.
    for (const employee of demoIdentities) {
      try {
        const user = await auth.getUser(employee.uid);
        if (
          user.email !== employee.email ||
          user.customClaims?.nexoDemo !== true ||
          user.customClaims?.role !== employee.role
        )
          throw new Error(
            "Identidade de demonstração ocupada por conta não gerenciada pelo seed.",
          );
      } catch (error) {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "auth/user-not-found"
        )
          throw error;
        try {
          await auth.getUserByEmail(employee.email);
          throw new Error(
            "E-mail de demonstração já utilizado. Nenhuma conta existente será alterada.",
          );
        } catch (lookup) {
          if (
            !lookup ||
            typeof lookup !== "object" ||
            !("code" in lookup) ||
            lookup.code !== "auth/user-not-found"
          )
            throw lookup;
        }
      }
    }
    for (const employee of demoIdentities) {
      try {
        await auth.getUser(employee.uid);
      } catch (error) {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "auth/user-not-found"
        )
          throw error;
        await auth.createUser({
          uid: employee.uid,
          email: employee.email,
          displayName: employee.name,
          password,
        });
        try {
          await auth.setCustomUserClaims(employee.uid, {
            role: employee.role,
            nexoDemo: true,
          });
        } catch (claimsError) {
          // Only remove the account created by THIS invocation if setup fails.
          await auth.deleteUser(employee.uid);
          throw claimsError;
        }
      }
      await db
        .collection<{
          _id: string;
          name: string;
          email: string;
          createdAt: Date;
          updatedAt: Date;
        }>("users")
        .updateOne(
          { _id: employee.uid },
          {
            $setOnInsert: {
              name: employee.name,
              email: employee.email,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        );
    }
    const { seedServiceDeskRecords } =
      await import("../src/server/repositories/service-desk-seed");
    const timestamp = new Date();
    await seedServiceDeskRecords(
      db,
      demoArticles,
      demoTickets(timestamp),
      demoConversations(timestamp),
    );
    console.log(
      "Seed concluído sem sobrescrever documentos existentes. Senhas não são alteradas em reexecuções.",
    );
  } finally {
    await db.client.close();
  }
}
main().catch((error) => {
  console.error(
    "Seed failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exitCode = 1;
});

import { spawn } from "node:child_process";

const database = [
  "database-integration.ts",
  "tickets-database.ts",
  "agent-database.ts",
  "memory-database.ts",
  "flows-database.ts",
  "handoff-database.ts",
  "final-validation-database.ts",
];
const ui = [
  "interface-check.mjs",
  "agent-ui.ts",
  "handoff-ui.ts",
  "customer-history-ui.ts",
  "transparency-integration.ts",
];
const mode = process.argv[2];
if (!["database", "ui"].includes(mode)) throw new Error("Use database ou ui.");
let failed = false;
for (const file of mode === "database" ? database : ui) {
  const args = [
    "--conditions=react-server",
    "--import",
    "tsx",
    `tests/${file}`,
    ...(file === "interface-check.mjs" ? ["--cloud"] : []),
  ];
  console.log(`\nValidando ${file}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        TEST_BASE_URL: process.env.TEST_BASE_URL || "http://localhost:3100",
      },
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  if (code !== 0) {
    failed = true;
    console.error(`FALHOU: ${file} (exit ${code}).`);
  } else console.log(`PASSOU: ${file}`);
}
process.exitCode = failed ? 1 : 0;

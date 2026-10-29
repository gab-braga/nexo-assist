import { loadEnvConfig } from "@next/env";
import type { AgentRun } from "../../src/types/ai";
loadEnvConfig(process.cwd());

async function main() {
  const { database } = await import("../../src/server/lib/mongodb");
  const { agentRunRepository } =
    await import("../../src/server/repositories/agent-runs");
  const { buildAgentMemory } = await import("../../src/server/ai/memory");
  const db = await database();
  try {
    const run = await db
      .collection<AgentRun>("agent_runs")
      .findOne({ _id: process.argv[2], customerId: process.argv[3] });
    if (!run) throw new Error("Missing test run");
    const snapshot = await agentRunRepository.loadContext(run);
    console.log(
      JSON.stringify({
        initialId: snapshot.initialMessage?._id,
        context: buildAgentMemory(snapshot, run._id),
      }),
    );
  } finally {
    await db.client.close();
  }
}
main().catch(() => {
  console.error("Context recovery failed");
  process.exitCode = 1;
});

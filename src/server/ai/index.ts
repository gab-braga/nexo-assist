import "server-only";
import { Mastra } from "@mastra/core/mastra";
import { nexoAgent } from "./agents/nexo-agent";

// No public Mastra catch-all routes or raw SDK traces containing ticket content.
export const mastra = new Mastra({ agents: { nexoAgent }, logger: false });
export { nexoAgent };

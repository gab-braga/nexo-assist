import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { ticketDeadline, ticketPriority } from "../src/server/policies/tickets";
import {
  knowledgeSearchPattern,
  knowledgeSearchTerms,
} from "../src/server/policies/knowledge-search";
import {
  demoArticles,
  demoConversations,
  demoIdentities,
} from "../src/server/data/service-desk-demo";
import { conversationState } from "../src/auth/conversation-state";
import { createTicketService } from "../src/server/services/tickets";
import { MemoryTickets } from "./helpers/ticket-memory";
import type { TicketData } from "../src/types/tickets";

test("SLA calendar covers exact opening/closing, weekends, fractional minutes and 3/5 business days", () => {
  const cases = [
    ["2026-10-30T20:30:12.123Z", "high", "2026-11-02T14:30:12.123Z"],
    ["2026-10-30T21:00:00Z", "high", "2026-11-02T15:00:00.000Z"],
    ["2026-11-02T10:59:00Z", "high", "2026-11-02T15:00:00.000Z"],
    ["2026-11-02T11:00:00Z", "high", "2026-11-02T15:00:00.000Z"],
    ["2026-10-30T20:30:00Z", "medium", "2026-11-04T20:30:00.000Z"],
    ["2026-10-30T20:30:00Z", "low", "2026-11-06T20:30:00.000Z"],
    ["2026-10-31T23:30:00Z", "critical", "2026-11-01T00:30:00.000Z"],
  ] as const;
  for (const [at, priority, expected] of cases)
    assert.equal(
      ticketDeadline(new Date(at), priority).toISOString(),
      expected,
    );
});

test("all impact/urgency combinations preserve critical precedence", () => {
  for (const impact of ["person", "team", "company"] as const) {
    for (const urgency of [
      "blocked",
      "today",
      "workaround",
      "normal",
    ] as const) {
      const expected =
        urgency === "blocked"
          ? impact === "person"
            ? "high"
            : "critical"
          : urgency === "today"
            ? "high"
            : urgency === "workaround"
              ? "medium"
              : "low";
      assert.equal(ticketPriority({ impact, urgency }), expected);
    }
  }
});

test("knowledge search tolerates accents and similar terms without executing supplied patterns", () => {
  const aliases = knowledgeSearchTerms("Como configurar a conexão remota?");
  assert.ok(aliases.includes("vpn"));
  const pattern = new RegExp(
    knowledgeSearchPattern(knowledgeSearchTerms("horario do expediente")),
    "i",
  );
  assert.ok(pattern.test("Horário do service desk"));
  assert.ok(
    knowledgeSearchTerms("(.+)* VPN senha=qualquer").every(
      (term) => !/[()*=]/.test(term),
    ),
  );
  assert.deepEqual(knowledgeSearchTerms("como para meu"), []);
  assert.ok(knowledgeSearchTerms("a ".repeat(500)).length <= 20);
});

test("demo fixtures are reproducible and cover every operational state with real role separation", () => {
  const now = new Date("2026-10-29T13:00:00Z");
  const first = demoConversations(now);
  assert.deepEqual(first, demoConversations(now));
  assert.equal(
    demoIdentities.filter((person) => person.role === "chat").length,
    2,
  );
  assert.equal(
    demoIdentities.filter((person) => person.role === "agent").length,
    1,
  );
  assert.ok(demoArticles.length >= 5 && demoArticles.length <= 10);
  assert.deepEqual(
    new Set(first.conversations.map(conversationState)),
    new Set([
      "AGENT_ACTIVE",
      "WAITING_FOR_ANALYST",
      "ANALYST_ACTIVE",
      "CLOSED",
    ]),
  );
  for (const message of first.messages)
    assert.ok(
      first.conversations.some(
        (conversation) =>
          conversation._id === message.conversationId &&
          conversation.customerId === message.authorId,
      ),
    );
});

test("employee priority changes rebase SLA on the last service response, never on the employee edit", async () => {
  const repository = new MemoryTickets();
  let clock = new Date("2026-10-29T13:00:00Z");
  const user = {
    uid: "final-test",
    name: "Teste",
    email: "test@example.test",
    role: "chat" as const,
  };
  const service = createTicketService({
    repository,
    authenticate: async () => user,
    available: () => {},
    now: () => clock,
  });
  const data: TicketData = {
    title: "Notebook indisponível",
    description: "Notebook sem energia e sem alternativa de trabalho.",
    type: "INC",
    category: "Hardware",
    impact: "person",
    urgency: "blocked",
  };
  const proposal = await service.prepareTicketChange({
    operation: "create",
    data,
  });
  const ticket = await service.confirmTicketChange({
    draftId: proposal.draftId,
    digest: proposal.digest,
    token: proposal.token,
  });
  clock = new Date("2026-10-30T13:00:00Z");
  const update = await service.prepareTicketChange({
    operation: "update",
    ticketId: ticket._id,
    version: ticket.version,
    data: { ...data, urgency: "normal" },
  });
  const changed = await service.confirmTicketChange({
    draftId: update.draftId,
    digest: update.digest,
    token: update.token,
  });
  assert.equal(changed.lastServiceUpdateAt, ticket.lastServiceUpdateAt);
  assert.equal(
    changed.nextResponseDueAt,
    ticketDeadline(new Date(ticket.lastServiceUpdateAt), "low").toISOString(),
  );
  assert.equal(changed.priority, "low");
});

test("application has no static runtime import cycles", () => {
  const root = resolve("src");
  function files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(resolve(directory, entry.name))
        : /\.tsx?$/.test(entry.name)
          ? [resolve(directory, entry.name)]
          : [],
    );
  }
  const graph = new Map<string, string[]>();
  for (const file of files(root)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const dependencies: string[] = [];
    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        statement.importClause?.isTypeOnly ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue;
      const bindings = statement.importClause?.namedBindings;
      if (
        !statement.importClause?.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length &&
        bindings.elements.every((element) => element.isTypeOnly)
      )
        continue;
      const specifier = statement.moduleSpecifier.text;
      const target = specifier.startsWith("@/")
        ? resolve(root, specifier.slice(2))
        : specifier.startsWith(".")
          ? resolve(dirname(file), specifier)
          : null;
      if (target)
        dependencies.push(
          ...[`${target}.ts`, `${target}.tsx`, resolve(target, "index.ts")],
        );
    }
    graph.set(file, dependencies);
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(file: string, chain: string[]) {
    if (!graph.has(file) || visited.has(file)) return;
    assert.ok(
      !active.has(file),
      `Runtime import cycle: ${[...chain, file].join(" -> ")}`,
    );
    active.add(file);
    for (const dependency of graph.get(file)!)
      visit(dependency, [...chain, file]);
    active.delete(file);
    visited.add(file);
  }
  for (const file of graph.keys()) visit(file, []);
});

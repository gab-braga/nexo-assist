import { loadEnvConfig } from "@next/env";
import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Conversation, Message, SessionUser } from "../src/types/domain";
import type { AgentStreamEvent } from "../src/types/ai";
import type { AgentTurnInput } from "../src/server/ai/schemas";
import { markdownSample, streamingParts } from "./fixtures/markdown";
loadEnvConfig(process.cwd());
const expect = baseExpect.configure({ timeout: 25000 });

async function main() {
  const { database } = await import("../src/server/lib/mongodb");
  const { getAdminAuth } =
    await import("../src/server/lib/firebase/firebase-admin");
  const { createConversationRecord } =
    await import("../src/server/repositories/conversations");
  const { createAgentTurnService } =
    await import("../src/server/services/agent-turns");
  const { agentRunRepository } =
    await import("../src/server/repositories/agent-runs");
  const { createNexoAgent } =
    await import("../src/server/ai/agents/nexo-agent");
  const { createNexoTools } = await import("../src/server/ai/tools");
  const { ticketService } = await import("../src/server/services/tickets");
  const { scriptedModel, textParts } = await import("./helpers/scripted-model");
  const { Mastra } = await import("@mastra/core/mastra");
  const db = await database();
  const auth = getAdminAuth();
  const namespace = `markdown-ui-${randomUUID()}`;
  const id = randomUUID();
  const historyId = randomUUID();
  const base = process.env.TEST_BASE_URL || "http://localhost:3100";
  const users: SessionUser[] = ["chat", "agent"].map((role, index) => ({
    uid: `${namespace}-${index}`,
    name: `Markdown ${role}`,
    email: `${namespace}-${index}@example.test`,
    role: role as SessionUser["role"],
  }));
  const accounts: string[] = [];
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors: string[] = [];
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const second = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  const streams = new Map<
    string,
    { iterator: AsyncGenerator<AgentStreamEvent>; controller: AbortController }
  >();
  try {
    const now = new Date();
    await createConversationRecord({
      _id: id,
      subject: "Markdown de teste",
      customerId: users[0].uid,
      customerName: users[0].name,
      status: "waiting",
      agentId: null,
      agentName: null,
      aiEnabled: true,
      createdAt: now,
      updatedAt: now,
      version: 4,
    });
    const messages: Message[] = [
      {
        _id: randomUUID(),
        authorId: users[0].uid,
        authorName: users[0].name,
        role: "chat",
        text: "# Funcionário **texto literal**",
      },
      {
        _id: historyId,
        authorId: "nexo-assist",
        authorName: "Nexo Assist",
        role: "assistant",
        text: markdownSample,
      },
      {
        _id: randomUUID(),
        authorId: users[1].uid,
        authorName: users[1].name,
        role: "agent",
        text: "# Analista **texto literal**",
      },
      {
        _id: randomUUID(),
        authorId: "nexo-system",
        authorName: "Atendimento",
        role: "assistant",
        text: "**Aviso de sistema literal**",
      },
    ].map((message, index) => ({
      ...message,
      conversationId: id,
      createdAt: now,
      sequence: index + 1,
      processingState: "completed",
    })) as Message[];
    await db.collection<Message>("messages").insertMany(messages);
    const pages = [];
    for (const user of users) {
      await auth.createUser({
        uid: user.uid,
        email: user.email,
        displayName: user.name,
      });
      accounts.push(user.uid);
      await auth.setCustomUserClaims(user.uid, { role: user.role });
      const token = await auth.createCustomToken(user.uid);
      const signed = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, returnSecureToken: true }),
        },
      );
      assert.ok(signed.ok);
      const { idToken } = (await signed.json()) as { idToken: string };
      const cookie = await auth.createSessionCookie(idToken, {
        expiresIn: 3600000,
      });
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      await context.addCookies([
        {
          name: "nexo-session",
          value: cookie,
          url: base,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      pages.push(page);
    }
    const [employee, analyst] = pages;
    const source = scriptedModel([textParts(streamingParts.join(""))]);
    const originalStream = source.doStream.bind(source);
    source.doStream = async (options) => {
      const output = await originalStream(options);
      const reader = output.stream.getReader();
      return {
        ...output,
        stream: new ReadableStream({
          async start(controller) {
            try {
              for (;;) {
                const next = await reader.read();
                if (next.done) break;
                if (next.value.type === "text-delta") {
                  controller.enqueue({
                    ...next.value,
                    delta: streamingParts[0],
                  });
                  await first;
                  controller.enqueue({
                    ...next.value,
                    delta: streamingParts[1],
                  });
                  await second;
                  controller.enqueue({
                    ...next.value,
                    delta: streamingParts[2],
                  });
                } else controller.enqueue(next.value);
              }
              controller.close();
            } catch (error) {
              controller.error(error);
            } finally {
              reader.releaseLock();
            }
          },
        }),
      };
    };
    const agent = createNexoAgent(
      source,
      createNexoTools({ tickets: ticketService, knowledge: async () => [] }),
    );
    new Mastra({ agents: { agent }, logger: false });
    const start = createAgentTurnService({
      repository: agentRunRepository,
      authenticate: async () => users[0],
      configured: () => {},
      agent: async () => agent,
    });
    await employee.exposeFunction(
      "markdownStart",
      async (input: AgentTurnInput) => {
        const controller = new AbortController();
        streams.set(input.requestId, {
          controller,
          iterator: await start(input, controller.signal),
        });
        return input.requestId;
      },
    );
    await employee.exposeFunction("markdownNext", async (runId: string) => {
      const next = await streams.get(runId)!.iterator.next();
      return next.done ? null : next.value;
    });
    await employee.addInitScript(() => {
      const original = window.fetch.bind(window);
      const bridge = window as unknown as {
        markdownStart(input: unknown): Promise<string>;
        markdownNext(id: string): Promise<unknown>;
      };
      window.fetch = async (input, init) => {
        if (!String(input).endsWith("/api/agent")) return original(input, init);
        const runId = await bridge.markdownStart(
          JSON.parse(String(init?.body)),
        );
        return new Response(
          new ReadableStream({
            async pull(controller) {
              const event = await bridge.markdownNext(runId);
              if (event === null) controller.close();
              else
                controller.enqueue(
                  new TextEncoder().encode(JSON.stringify(event) + "\n"),
                );
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        );
      };
    });
    await employee.goto(`${base}/chat?conversation=${id}`);
    const historical = employee
      .locator('[data-visual="agent-markdown"]')
      .first();
    await expect(
      historical.getByRole("heading", {
        name: "Orientação de TI",
        exact: true,
      }),
    ).toBeVisible();
    for (const tag of [
      "strong",
      "em",
      "ol",
      "ul",
      "blockquote",
      "table",
      "pre",
      "code",
    ])
      assert.ok(await historical.locator(tag).count(), tag);
    await expect(
      historical.getByRole("link", { name: "Documentação", exact: true }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    assert.equal(
      await historical
        .locator("script, iframe, img, a[href^='javascript:']")
        .count(),
      0,
    );
    await expect(
      employee.getByText("# Funcionário **texto literal**", { exact: true }),
    ).toBeVisible();
    await expect(
      employee.getByText("# Analista **texto literal**", { exact: true }),
    ).toBeVisible();
    await expect(
      employee.getByText("**Aviso de sistema literal**", { exact: true }),
    ).toBeVisible();
    await analyst.goto(`${base}/agent?conversation=${id}`);
    await expect(
      analyst.locator('[data-visual="agent-markdown"] h1'),
    ).toHaveText("Orientação de TI");
    await expect(
      analyst.getByText("# Analista **texto literal**", { exact: true }),
    ).toHaveCount(1);
    await employee
      .locator("textarea")
      .fill("Mostre uma resposta em Markdown por partes.");
    await employee.locator("textarea").press("Enter");
    await expect(
      employee.getByRole("heading", {
        name: "Resposta em streaming",
        exact: true,
      }),
    ).toBeVisible();
    releaseFirst();
    await expect(
      employee.locator('[data-visual="agent-markdown"] pre').last(),
    ).toContainText("Ainda recebendo");
    releaseSecond();
    await expect(
      employee.getByRole("heading", { name: "Concluído", exact: true }),
    ).toBeVisible();
    await expect(employee.locator("textarea")).toHaveValue("");
    await employee.reload();
    await expect(
      employee.getByRole("heading", { name: "Concluído", exact: true }),
    ).toBeVisible();
    const response = await db
      .collection<Message>("messages")
      .findOne({ conversationId: id, text: streamingParts.join("") });
    assert.ok(response);
    assert.equal(
      (await db.collection<Message>("messages").findOne({ _id: historyId }))
        ?.text,
      markdownSample,
    );
    const wide =
      "| " +
      Array.from({ length: 15 }, (_, index) => `Coluna ${index}`).join(" | ") +
      " |\n| " +
      Array(15).fill("---").join(" | ") +
      " |\n| " +
      Array(15).fill("conteúdo").join(" | ") +
      " |\n\n```text\n" +
      "x".repeat(400) +
      "\n```";
    await db
      .collection<Message>("messages")
      .updateOne({ _id: response._id }, { $set: { text: wide } });
    await employee.setViewportSize({ width: 390, height: 844 });
    await employee.reload();
    assert.ok(
      await employee.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const overflow = await employee
      .locator('[data-visual="agent-markdown"]')
      .last()
      .locator("pre")
      .evaluate((element) => element.scrollWidth > element.clientWidth);
    assert.ok(overflow);
    await employee.evaluate(() => {
      document.documentElement.style.setProperty("--muted", "#25282f");
      document.documentElement.style.setProperty("--foreground", "#e5e7eb");
    });
    assert.equal(
      await employee
        .locator('[data-visual="agent-markdown"] pre')
        .last()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
      "rgb(37, 40, 47)",
    );
    assert.deepEqual(errors, []);
    console.log(
      "Markdown UI passed: historical AI rendering in chat/console, human/system text untouched, safe links/HTML, real progressive Mastra stream with open fence, original persisted text, reload, mobile overflow and theme variables.",
    );
  } finally {
    releaseFirst();
    releaseSecond();
    for (const stream of streams.values()) stream.controller.abort();
    await Promise.allSettled(
      [...streams.values()].map((stream) => stream.iterator.return(undefined)),
    );
    await browser.close();
    await db
      .collection("agent_runs")
      .deleteMany({ conversationId: id, customerId: users[0].uid });
    await db.collection<Message>("messages").deleteMany({ conversationId: id });
    await db
      .collection("conversation_events")
      .deleteMany({ conversationId: id });
    await db
      .collection<Conversation>("conversations")
      .deleteOne({ _id: id, customerId: users[0].uid });
    await Promise.all(accounts.map((uid) => auth.deleteUser(uid)));
    await db.client.close();
  }
}
main().catch((error) => {
  console.error(
    "Markdown UI failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});

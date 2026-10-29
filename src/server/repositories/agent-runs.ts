import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { database } from "@/server/lib/mongodb";
import { AppError, databaseOperation } from "@/server/lib/errors";
import type { ClientSession, Db } from "mongodb";
import type {
  Conversation,
  Message,
  SessionUser,
  ConversationContextPatch,
} from "@/types/domain";
import type { AgentRun, AgentAudit, AgentMemorySnapshot } from "@/types/ai";
import type { Ticket, TicketDraft } from "@/types/tickets";
import { AI_LIMITS } from "@/server/ai/config";
import { PROMPT_VERSION } from "@/server/ai/prompts/nexo";
import type { AgentTurnInput } from "@/server/ai/schemas";
import { createConversationRecord } from "./conversations";
import { transferToHuman } from "./handoff";
import { conversationTitle } from "@/lib/conversation-title";
import { conversationState } from "@/auth/conversation-state";
import { ConversationContextPatchSchema } from "@/server/ai/schemas";
import { mergeAudit } from "@/server/policies/agent-actions";

export function assertAgentConversation(
  conversation: Conversation | null,
  userId: string,
  run?: AgentRun,
) {
  if (!conversation || conversation.customerId !== userId)
    throw new AppError("NOT_FOUND", "Atendimento não encontrado.");
  if (
    conversationState(conversation) !== "AGENT_ACTIVE" ||
    (run &&
      (conversation.aiActiveRunId !== run._id ||
        (conversation.aiControlVersion ?? 0) !== run.controlVersion))
  )
    throw new AppError(
      "HUMAN_CONTROL",
      "A conversa está com o atendimento humano ou foi encerrada.",
    );
}

async function interruptExpiredRun(
  db: Db,
  conversation: Conversation,
  run: AgentRun,
  session: ClientSession,
) {
  const now = new Date();
  const updated = await db.collection<AgentRun>("agent_runs").updateOne(
    { _id: run._id, state: "running", expiresAt: { $lte: now } },
    {
      $set: {
        state: "interrupted",
        errorCode: "RUN_INTERRUPTED",
        completedAt: now,
        audit: run.audit.map((entry) =>
          entry.state === "running"
            ? { ...entry, state: "unknown" as const }
            : entry,
        ),
      },
    },
    { session },
  );
  if (updated.modifiedCount !== 1)
    throw new AppError("CONFLICT", "A execução mudou. Atualize a conversa.");
  await db.collection<Message>("messages").updateOne(
    {
      _id: run._id,
      conversationId: run.conversationId,
      authorId: run.customerId,
    },
    {
      $set: {
        processingState: "interrupted",
        processingErrorCode: "RUN_INTERRUPTED",
        runId: run._id,
      },
    },
    { session },
  );
  if (conversation.aiActiveRunId === run._id) {
    const cleared = await db
      .collection<Conversation>("conversations")
      .updateOne(
        {
          _id: conversation._id,
          version: conversation.version,
          aiActiveRunId: run._id,
        },
        { $set: { aiActiveRunId: null }, $inc: { version: 1 } },
        { session },
      );
    if (cleared.modifiedCount !== 1)
      throw new AppError(
        "CONFLICT",
        "A conversa mudou. Atualize e tente novamente.",
      );
  }
  return {
    ...run,
    state: "interrupted" as const,
    errorCode: "RUN_INTERRUPTED",
    completedAt: now,
  };
}

export interface AgentRunRepository {
  recordAudit(run: AgentRun, entry: AgentAudit): Promise<AgentAudit>;
  begin(
    user: SessionUser,
    input: AgentTurnInput,
    model: string,
  ): Promise<AgentRun>;
  loadContext(run: AgentRun): Promise<AgentMemorySnapshot>;
  remember(run: AgentRun, patch: ConversationContextPatch): Promise<void>;
  recover(conversationId: string, customerId: string): Promise<boolean>;
  assertActive(run: AgentRun): Promise<void>;
  handoff(
    run: AgentRun,
    reason: string,
    summary: string,
    audit?: AgentAudit[],
  ): Promise<Message | void>;
  finish(
    run: AgentRun,
    text: string | null,
    audit: AgentAudit[],
    usage: AgentRun["usage"],
    code?: string,
  ): Promise<Message | null>;
}

const mongoAgentRuns: AgentRunRepository = {
  async recordAudit(run, entry) {
    const db = await database();
    const session = db.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const collection = db.collection<AgentRun>("agent_runs");
        const stored = await collection.findOne(
          {
            _id: run._id,
            conversationId: run.conversationId,
            customerId: run.customerId,
          },
          { session },
        );
        if (!stored)
          throw new AppError("NOT_FOUND", "Execução não encontrada.");
        const previous = stored.audit.find((event) => event.id === entry.id);
        if (previous?.state && previous.state !== "running") return previous;
        if (entry.state === "running" && stored.state !== "running")
          throw new AppError("HUMAN_CONTROL", "A execução não está ativa.");
        const audit = mergeAudit(stored.audit, [entry]);
        if (!audit.some((event) => event.id === entry.id))
          throw new AppError("TOOL_LIMIT", "Limite de registros atingido.");
        await collection.updateOne(
          { _id: run._id },
          { $set: { audit } },
          { session },
        );
        return audit.find((event) => event.id === entry.id)!;
      });
    } finally {
      await session.endSession();
    }
  },
  async begin(user, input, model) {
    const db = await database();
    const session = db.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const conversations = db.collection<Conversation>("conversations");
        const runs = db.collection<AgentRun>("agent_runs");
        let conversation = await conversations.findOne(
          { _id: input.conversationId },
          { session },
        );
        if (!conversation && input.startConversation) {
          const now = new Date();
          conversation = {
            _id: input.conversationId,
            customerId: user.uid,
            customerName: user.name,
            subject: conversationTitle(input.text),
            status: "waiting",
            agentId: null,
            agentName: null,
            createdAt: now,
            updatedAt: now,
            version: 0,
            aiEnabled: true,
            initialMessageId: input.requestId,
          };
          // The first message, run and conversation either all commit or all roll back.
          await createConversationRecord(conversation, session);
        }
        if (!conversation || conversation.customerId !== user.uid)
          throw new AppError("NOT_FOUND", "Atendimento não encontrado.");
        if (
          input.startConversation &&
          conversation.initialMessageId !== input.requestId
        )
          throw new AppError(
            "CONFLICT",
            "O primeiro envio desta conversa já foi registrado.",
          );
        const hash = createHash("sha256").update(input.text).digest("hex");
        const previous = await runs.findOne(
          { _id: input.requestId },
          { session },
        );
        if (previous) {
          if (
            previous.customerId !== user.uid ||
            previous.conversationId !== input.conversationId ||
            previous.inputHash !== hash
          )
            throw new AppError(
              "CONFLICT",
              "Identificador de mensagem já utilizado.",
            );
          if (previous.state === "running" && previous.expiresAt <= new Date())
            return interruptExpiredRun(db, conversation, previous, session);
          if (previous.state === "running")
            throw new AppError(
              "RUN_IN_PROGRESS",
              "Essa mensagem já está sendo processada.",
            );
          return previous;
        }
        assertAgentConversation(conversation, user.uid);
        if ((conversation.aiMessageCount ?? 0) >= AI_LIMITS.messages)
          throw new AppError(
            "MESSAGE_LIMIT",
            "Limite de 30 mensagens atingido. Solicite atendimento humano por um novo atendimento.",
          );
        if (conversation.aiActiveRunId) {
          const active = await runs.findOne(
            { _id: conversation.aiActiveRunId },
            { session },
          );
          if (active?.state === "running" && active.expiresAt > new Date())
            throw new AppError(
              "RUN_IN_PROGRESS",
              "Aguarde a resposta anterior.",
            );
          if (active?.state === "running") {
            await interruptExpiredRun(db, conversation, active, session);
            conversation = {
              ...conversation,
              version: conversation.version + 1,
              aiActiveRunId: null,
            };
          }
        }
        const now = new Date();
        // Any new accepted turn fences the previous proposal before interpretation.
        // Replays return above, so a retry never invalidates its own draft.
        if (conversation.pendingDraftId) {
          const invalidated = await db
            .collection<TicketDraft>("ticket_drafts")
            .updateOne(
              {
                _id: conversation.pendingDraftId,
                customerId: user.uid,
                conversationId: conversation._id,
                appliedAt: null,
                cancelledAt: null,
              },
              { $set: { cancelledAt: now } },
              { session },
            );
          if (invalidated.modifiedCount)
            await db
              .collection<{
                _id: string;
                conversationId: string;
                actorId: string;
                operation: string;
                draftId: string;
                requestId: string;
                createdAt: Date;
              }>("conversation_events")
              .insertOne(
                {
                  _id: randomUUID(),
                  conversationId: conversation._id,
                  actorId: user.uid,
                  operation: "draft_invalidated",
                  draftId: conversation.pendingDraftId,
                  requestId: input.requestId,
                  createdAt: now,
                },
                { session },
              );
        }
        const run: AgentRun = {
          _id: input.requestId,
          conversationId: input.conversationId,
          customerId: user.uid,
          inputHash: hash,
          controlVersion: conversation.aiControlVersion ?? 0,
          state: "running",
          createdAt: now,
          expiresAt: new Date(now.getTime() + AI_LIMITS.timeoutMs + 10000),
          completedAt: null,
          response: null,
          responseId: randomUUID(),
          errorCode: null,
          model,
          promptVersion: PROMPT_VERSION,
          audit: [],
          usage: null,
        };
        await runs.insertOne(run, { session });
        await db.collection<Message>("messages").insertOne(
          {
            _id: input.requestId,
            conversationId: input.conversationId,
            authorId: user.uid,
            authorName: user.name,
            role: "chat",
            text: input.text,
            createdAt: now,
            sequence: conversation.version + 1,
            runId: run._id,
            processingState: "processing",
            processingErrorCode: null,
          },
          { session },
        );
        const updated = await conversations.updateOne(
          { _id: conversation._id, version: conversation.version },
          {
            $set: { aiActiveRunId: run._id, updatedAt: now },
            $inc: { aiMessageCount: 1, version: 1 },
          },
          { session },
        );
        if (updated.modifiedCount !== 1)
          throw new AppError(
            "CONFLICT",
            "A conversa mudou. Atualize e tente novamente.",
          );
        return run;
      });
    } catch (error) {
      // Concurrent initial inserts may report duplicate-key instead of a retryable
      // transaction conflict. Never repeat the model invocation or change IDs.
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 11000
      )
        throw new AppError(
          "CONFLICT",
          "Envio concorrente. Repita a mesma requisição para verificar o resultado.",
        );
      throw error;
    } finally {
      await session.endSession();
    }
  },
  async loadContext(run) {
    const db = await database();
    const conversation = await db
      .collection<Conversation>("conversations")
      .findOne({ _id: run.conversationId });
    assertAgentConversation(conversation, run.customerId, run);
    if (run.expiresAt <= new Date())
      throw new AppError("TIMEOUT", "A execução expirou.");
    const messages = db.collection<Message>("messages");
    const recentMessages = (
      await messages
        .find({ conversationId: run.conversationId })
        .sort({ sequence: -1, createdAt: -1, _id: -1 })
        .limit(20)
        .toArray()
    ).reverse();
    const initialMessage = conversation!.initialMessageId
      ? (recentMessages.find(
          (message) => message._id === conversation!.initialMessageId,
        ) ??
        (await messages.findOne({
          _id: conversation!.initialMessageId,
          conversationId: run.conversationId,
        })))
      : await messages
          .find({ conversationId: run.conversationId })
          .sort({ sequence: 1, createdAt: 1, _id: 1 })
          .limit(1)
          .next();
    const draft = conversation!.pendingDraftId
      ? await db.collection<TicketDraft>("ticket_drafts").findOne({
          _id: conversation!.pendingDraftId,
          customerId: run.customerId,
        })
      : null;
    const selectedId =
      conversation!.selectedTicketId ??
      (draft?.appliedAt ? draft.ticketId : null);
    const ticket = selectedId
      ? await db
          .collection<Ticket>("tickets")
          .findOne({ _id: selectedId, customerId: run.customerId })
      : null;
    return {
      flow: conversation!.flow,
      analystSummary: conversation!.analystSummary,
      initialMessage,
      recentMessages,
      selectedTicket: ticket
        ? {
            id: ticket._id,
            title: ticket.title,
            status: ticket.status,
            version: ticket.version,
          }
        : null,
      pendingOperation: draft
        ? {
            draftId: draft._id,
            ticketId: draft.ticketId,
            operation: draft.operation,
            state: draft.appliedAt
              ? "applied"
              : draft.cancelledAt
                ? "cancelled"
                : draft.expiresAt <= new Date()
                  ? "expired"
                  : "pending",
            data: draft.data,
          }
        : null,
    };
  },
  async remember(run, input) {
    const patch = ConversationContextPatchSchema.parse(input);
    const db = await database();
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const conversations = db.collection<Conversation>("conversations");
        const conversation = await conversations.findOne(
          { _id: run.conversationId },
          { session },
        );
        assertAgentConversation(conversation, run.customerId, run);
        if (run.expiresAt <= new Date())
          throw new AppError("TIMEOUT", "A execução expirou.");
        for (const ticketId of patch.flow?.ticketIds ?? []) {
          if (
            !(await db
              .collection<Ticket>("tickets")
              .findOne(
                { _id: ticketId, customerId: run.customerId },
                { session },
              ))
          )
            throw new AppError("NOT_FOUND", "Chamado não encontrado.");
        }
        if (patch.flow && conversation?.pendingDraftId) {
          const draft = await db
            .collection<TicketDraft>("ticket_drafts")
            .findOne(
              { _id: conversation.pendingDraftId, customerId: run.customerId },
              { session },
            );
          if (
            draft &&
            !draft.appliedAt &&
            !draft.cancelledAt &&
            draft.expiresAt > new Date()
          )
            throw new AppError(
              "INVALID_OPERATION",
              "A proposta está aguardando revisão. Não substitua o estado depois de preparar o rascunho.",
            );
        }
        if (
          patch.flow &&
          patch.flow.stage !== "idle" &&
          conversation?.flow?.intent === patch.flow.intent
        ) {
          patch.flow = {
            ...patch.flow,
            environment:
              patch.flow.environment ?? conversation.flow.environment,
            data: { ...conversation.flow.data, ...patch.flow.data },
          };
        }
        if (
          patch.selectedTicketId &&
          !(await db
            .collection<Ticket>("tickets")
            .findOne(
              { _id: patch.selectedTicketId, customerId: run.customerId },
              { session },
            ))
        )
          throw new AppError("NOT_FOUND", "Chamado não encontrado.");
        if (
          patch.pendingDraftId &&
          !(await db
            .collection<TicketDraft>("ticket_drafts")
            .findOne(
              { _id: patch.pendingDraftId, customerId: run.customerId },
              { session },
            ))
        )
          throw new AppError("NOT_FOUND", "Rascunho não encontrado.");
        const saved = await conversations.updateOne(
          { _id: run.conversationId, version: conversation!.version },
          { $set: patch, $inc: { version: 1 } },
          { session },
        );
        if (saved.modifiedCount !== 1)
          throw new AppError("CONFLICT", "O contexto foi alterado.");
        await db.collection<AgentRun>("agent_runs").updateOne(
          { _id: run._id, state: "running" },
          {
            $set: {
              contextReferences: {
                selectedTicketId:
                  patch.selectedTicketId !== undefined
                    ? patch.selectedTicketId
                    : (conversation!.selectedTicketId ?? null),
                pendingDraftId:
                  patch.pendingDraftId !== undefined
                    ? patch.pendingDraftId
                    : (conversation!.pendingDraftId ?? null),
              },
            },
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
  },
  async recover(conversationId, customerId) {
    const db = await database();
    const session = db.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const conversation = await db
          .collection<Conversation>("conversations")
          .findOne({ _id: conversationId, customerId }, { session });
        if (!conversation)
          throw new AppError("NOT_FOUND", "Atendimento não encontrado.");
        if (!conversation.aiActiveRunId) return false;
        const run = await db
          .collection<AgentRun>("agent_runs")
          .findOne(
            { _id: conversation.aiActiveRunId, conversationId, customerId },
            { session },
          );
        if (!run || run.state !== "running" || run.expiresAt > new Date())
          return false;
        await interruptExpiredRun(db, conversation, run, session);
        return true;
      });
    } finally {
      await session.endSession();
    }
  },
  async assertActive(run) {
    if (run.expiresAt <= new Date())
      throw new AppError("TIMEOUT", "O tempo de atendimento foi excedido.");
    const conversation = await (await database())
      .collection<Conversation>("conversations")
      .findOne({ _id: run.conversationId });
    assertAgentConversation(conversation, run.customerId, run);
  },
  async handoff(run, reason, summary, audit = []) {
    return transferToHuman({
      customerId: run.customerId,
      conversationId: run.conversationId,
      requestId: run._id,
      reason,
      summary,
      run,
      audit,
    });
  },
  async finish(run, text, audit, usage, code) {
    const db = await database();
    const session = db.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const runs = db.collection<AgentRun>("agent_runs");
        const stored = await runs.findOne(
          { _id: run._id, state: "running" },
          { session },
        );
        if (!stored) return null;
        const recordedAudit = mergeAudit(stored.audit, audit).map((entry) =>
          entry.state === "running"
            ? { ...entry, state: "unknown" as const }
            : entry,
        );
        const conversations = db.collection<Conversation>("conversations");
        const conversation = await conversations.findOne(
          { _id: run.conversationId },
          { session },
        );
        const now = new Date();
        let allowed = stored.expiresAt > now;
        try {
          assertAgentConversation(conversation, run.customerId, run);
        } catch {
          allowed = false;
        }
        const message: Message | null =
          allowed && text && !code
            ? {
                _id: run.responseId,
                conversationId: run.conversationId,
                authorId: "nexo-assist",
                authorName: "Nexo Assist",
                role: "assistant",
                text,
                createdAt: new Date(),
                sequence: conversation!.version + 1,
                runId: run._id,
                processingState: "completed",
                decisionRefs: recordedAudit.map(
                  (entry, index) => entry.id ?? `${run._id}:${index}`,
                ),
              }
            : null;
        if (message)
          await db
            .collection<Message>("messages")
            .insertOne(message, { session });
        const failureCode =
          code ??
          (stored.expiresAt <= now
            ? "TIMEOUT"
            : allowed
              ? null
              : "HUMAN_CONTROL");
        const interrupted =
          !!failureCode &&
          ["RUN_INTERRUPTED", "TIMEOUT", "HUMAN_CONTROL"].includes(failureCode);
        await db.collection<Message>("messages").updateOne(
          {
            _id: run._id,
            conversationId: run.conversationId,
            authorId: run.customerId,
          },
          {
            $set: {
              processingState: message
                ? "completed"
                : interrupted
                  ? "interrupted"
                  : "failed",
              processingErrorCode: failureCode,
              decisionRefs: recordedAudit.map(
                (entry, index) => entry.id ?? `${run._id}:${index}`,
              ),
            },
          },
          { session },
        );
        await runs.updateOne(
          { _id: run._id, state: "running" },
          {
            $set: {
              state: message
                ? "completed"
                : interrupted
                  ? "interrupted"
                  : "failed",
              response: message?.text ?? null,
              responseCreatedAt: message?.createdAt ?? null,
              responseSequence: message?.sequence ?? null,
              completedAt: new Date(),
              errorCode: failureCode,
              audit: recordedAudit,
              usage,
            },
          },
          { session },
        );
        if (conversation?.aiActiveRunId === run._id) {
          await conversations.updateOne(
            {
              _id: conversation._id,
              version: conversation.version,
              aiActiveRunId: run._id,
            },
            {
              $set: { aiActiveRunId: null, updatedAt: new Date() },
              $inc: { version: 1 },
            },
            { session },
          );
        }
        return message;
      });
    } finally {
      await session.endSession();
    }
  },
};

export const agentRunRepository: AgentRunRepository = {
  recordAudit: (run, entry) =>
    databaseOperation(() => mongoAgentRuns.recordAudit(run, entry)),
  begin: (user, input, model) =>
    databaseOperation(() => mongoAgentRuns.begin(user, input, model)),
  loadContext: (run) =>
    databaseOperation(() => mongoAgentRuns.loadContext(run)),
  remember: (run, patch) =>
    databaseOperation(() => mongoAgentRuns.remember(run, patch)),
  recover: (id, owner) =>
    databaseOperation(() => mongoAgentRuns.recover(id, owner)),
  assertActive: (run) =>
    databaseOperation(() => mongoAgentRuns.assertActive(run)),
  handoff: (run, reason, summary, audit) =>
    databaseOperation(() =>
      mongoAgentRuns.handoff(run, reason, summary, audit),
    ),
  finish: (run, text, audit, usage, code) =>
    databaseOperation(() =>
      mongoAgentRuns.finish(run, text, audit, usage, code),
    ),
};

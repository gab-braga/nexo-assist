import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database } from "@/server/lib/mongodb";
import { AppError, databaseOperation } from "@/server/lib/errors";
import { canProcessAgent } from "@/auth/conversation-state";
import { pauseConversationAgent } from "./conversations";
import { buildHandoffSummary, handoffNotice } from "@/server/policies/handoff";
import type { Conversation, Message } from "@/types/domain";
import type { AgentRun, AgentAudit } from "@/types/ai";
import type { Ticket } from "@/types/tickets";

/** Shared by the authenticated employee command and guarded Mastra tool. */
export async function transferToHuman(input: {
  customerId: string;
  conversationId: string;
  requestId: string;
  reason: string;
  summary: string;
  run?: AgentRun;
  audit?: AgentAudit[];
}): Promise<Message> {
  const parsed = z
    .object({
      reason: z.enum(["requested", "critical", "overdue", "uncertain"]),
      summary: z.string().trim().min(5).max(1500),
    })
    .parse(input);
  return databaseOperation(async () => {
    const db = await database();
    const session = db.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const conversations = db.collection<Conversation>("conversations");
        const conversation = await conversations.findOne(
          { _id: input.conversationId, customerId: input.customerId },
          { session },
        );
        if (!conversation)
          throw new AppError("NOT_FOUND", "Atendimento não encontrado.");
        const messages = db.collection<Message>("messages");
        const receipts = db.collection<{
          _id: string;
          conversationId: string;
          actorId: string;
          operation: string;
          messageId?: string;
          createdAt: Date;
        }>("conversation_events");
        const receipt = await receipts.findOne(
          { _id: `handoff:${input.requestId}` },
          { session },
        );
        if (receipt) {
          if (
            receipt.conversationId !== input.conversationId ||
            receipt.actorId !== input.customerId
          )
            throw new AppError(
              "CONFLICT",
              "Identificador de transferência já utilizado.",
            );
          const previous = receipt.messageId
            ? await messages.findOne(
                { _id: receipt.messageId, conversationId: conversation._id },
                { session },
              )
            : null;
          if (previous) return previous;
        }
        if (
          conversation.handoff &&
          (conversation.handoff.id === input.requestId ||
            (!input.run && !canProcessAgent(conversation)))
        ) {
          const notice = conversation.handoff.messageId
            ? await messages.findOne(
                {
                  _id: conversation.handoff.messageId,
                  conversationId: conversation._id,
                },
                { session },
              )
            : null;
          if (notice) {
            await receipts.insertOne(
              {
                _id: `handoff:${input.requestId}`,
                conversationId: conversation._id,
                actorId: input.customerId,
                operation: "handoff_replayed",
                messageId: notice._id,
                createdAt: new Date(),
              },
              { session },
            );
            return notice;
          }
        }
        if (!canProcessAgent(conversation))
          throw new AppError(
            "HUMAN_CONTROL",
            "A conversa já está com atendimento humano ou foi encerrada.",
          );
        const run = input.run;
        if (
          run &&
          (run.customerId !== input.customerId ||
            run.conversationId !== input.conversationId ||
            conversation.aiActiveRunId !== run._id ||
            (conversation.aiControlVersion ?? 0) !== run.controlVersion)
        )
          throw new AppError(
            "HUMAN_CONTROL",
            "O controle desta execução mudou.",
          );
        if (run && run.expiresAt <= new Date())
          throw new AppError("TIMEOUT", "A execução expirou.");
        const recent = await messages
          .find({ conversationId: conversation._id }, { session })
          .sort({ sequence: -1, createdAt: -1, _id: -1 })
          .limit(16)
          .toArray();
        recent.reverse();
        if (
          conversation.initialMessageId &&
          !recent.some(
            (message) => message._id === conversation.initialMessageId,
          )
        ) {
          const first = await messages.findOne(
            {
              _id: conversation.initialMessageId,
              conversationId: conversation._id,
            },
            { session },
          );
          if (first) recent.unshift(first);
        }
        const ticket = conversation.selectedTicketId
          ? await db
              .collection<Ticket>("tickets")
              .findOne(
                {
                  _id: conversation.selectedTicketId,
                  customerId: input.customerId,
                },
                { session },
              )
          : null;
        const related = ticket
          ? [
              {
                ...ticket,
                createdAt: ticket.createdAt.toISOString(),
                updatedAt: ticket.updatedAt.toISOString(),
                lastServiceUpdateAt: ticket.lastServiceUpdateAt.toISOString(),
                nextResponseDueAt: ticket.nextResponseDueAt.toISOString(),
                resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
                overdue:
                  ticket.status !== "resolved" &&
                  ticket.nextResponseDueAt < new Date(),
              },
            ]
          : [];
        const now = new Date();
        const summary = buildHandoffSummary(
          conversation,
          parsed.summary,
          recent,
          related,
        );
        const id = run?.responseId ?? randomUUID();
        await pauseConversationAgent(db, conversation, session);
        const after: Conversation = {
          ...conversation,
          aiHandoff: true,
          aiActiveRunId: null,
          aiControlVersion: (conversation.aiControlVersion ?? 0) + 1,
          handoff: {
            id: input.requestId,
            messageId: id,
            reason: parsed.reason,
            requestedAt: now.toISOString(),
            summary,
          },
          flow: { intent: "handoff", stage: "idle" },
          version: conversation.version + 1,
          updatedAt: now,
        };
        const saved = await conversations.replaceOne(
          { _id: conversation._id, version: conversation.version },
          after,
          { session },
        );
        if (saved.modifiedCount !== 1)
          throw new AppError("CONFLICT", "A conversa mudou.");
        const evidence: AgentAudit = {
          kind: "service_validation",
          intent: "handoff",
          tool: "requestHumanHandoff",
          rationale: "Transferência validada pelo servidor.",
          parameters: { reason: parsed.reason },
          outcome: "success",
          evidenceIds: [conversation._id],
          at: now.toISOString(),
        };
        const entries = [...(input.audit ?? []), evidence];
        const notice: Message = {
          _id: id,
          conversationId: conversation._id,
          authorId: "nexo-assist",
          authorName: "Nexo Assist",
          role: "assistant",
          text: handoffNotice,
          createdAt: now,
          sequence: after.version,
          ...(run
            ? {
                runId: run._id,
                decisionRefs: entries.map((_, index) => `${run._id}:${index}`),
              }
            : {}),
          processingState: "completed",
        };
        await messages.insertOne(notice, { session });
        if (run) {
          await messages.updateOne(
            { _id: run._id, conversationId: conversation._id },
            {
              $set: { processingState: "completed", processingErrorCode: null },
            },
            { session },
          );
          await db
            .collection<AgentRun>("agent_runs")
            .updateOne(
              { _id: run._id },
              {
                $set: {
                  state: "completed",
                  response: notice.text,
                  responseCreatedAt: now,
                  responseSequence: notice.sequence,
                  completedAt: now,
                  errorCode: null,
                  audit: entries,
                },
              },
              { session },
            );
        }
        await db
          .collection<{
            _id: string;
            conversationId: string;
            actorId: string;
            operation: string;
            reason: string;
            summary: typeof summary;
            messageId: string;
            createdAt: Date;
            previousState: string;
            newState: string;
            outcome: string;
          }>("conversation_events")
          .insertOne(
            {
              _id: `handoff:${input.requestId}`,
              conversationId: conversation._id,
              actorId: input.customerId,
              operation: "request_human",
              reason: parsed.reason,
              summary,
              messageId: id,
              createdAt: now,
              previousState: "AGENT_ACTIVE",
              newState: "WAITING_FOR_ANALYST",
              outcome: "success",
            },
            { session },
          );
        return notice;
      });
    } finally {
      await session.endSession();
    }
  });
}

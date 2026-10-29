import "server-only";
import { z } from "zod";
import { requireUser } from "@/auth/guards";
import { AppError } from "@/server/lib/errors";
import {
  findKnowledgeArticle,
  findKnowledgeArticles,
} from "@/server/repositories/knowledge";
import { KnowledgeQuerySchema } from "@/server/schemas/tickets";

export async function listKnowledgeArticles(input: unknown = {}) {
  await requireUser();
  const { search } = KnowledgeQuerySchema.parse(input);
  return findKnowledgeArticles(search);
}

export async function getKnowledgeArticle(input: unknown) {
  await requireUser();
  const id = z
    .string()
    .regex(/^[a-z0-9-]{1,100}$/)
    .parse(input);
  const article = await findKnowledgeArticle(id);
  if (!article) throw new AppError("NOT_FOUND", "Artigo não encontrado.");
  return article;
}

"use server";

import { result } from "@/server/lib/errors";
import * as knowledge from "@/server/services/knowledge";

export async function listKnowledgeArticles(input: unknown = {}) {
  return result(() => knowledge.listKnowledgeArticles(input));
}

export async function getKnowledgeArticle(input: unknown) {
  return result(() => knowledge.getKnowledgeArticle(input));
}

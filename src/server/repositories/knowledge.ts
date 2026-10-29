import "server-only";
import { database } from "@/server/lib/mongodb";
import type { KnowledgeArticle } from "@/types/tickets";

export async function findKnowledgeArticles(search: string) {
  const filter = search
    ? {
        $or: ["title", "content", "keywords"].map((field) => ({
          [field]: {
            $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            $options: "i",
          },
        })),
      }
    : {};
  return (await database())
    .collection<KnowledgeArticle>("knowledge_articles")
    .find(filter)
    .sort({ _id: 1 })
    .limit(50)
    .toArray();
}

export async function findKnowledgeArticle(id: string) {
  return (await database())
    .collection<KnowledgeArticle>("knowledge_articles")
    .findOne({ _id: id });
}

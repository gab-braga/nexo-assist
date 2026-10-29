import "server-only";
import { database } from "@/server/lib/mongodb";
import type { KnowledgeArticle } from "@/types/tickets";
import {
  knowledgeSearchPattern,
  knowledgeSearchTerms,
} from "@/server/policies/knowledge-search";
import { normalizeProblem } from "@/server/policies/tickets";

export async function findKnowledgeArticles(search: string) {
  const terms = knowledgeSearchTerms(search);
  if (search && !terms.length) return [];
  const filter = search
    ? {
        $or: ["title", "content", "keywords"].map((field) => ({
          [field]: {
            $regex: knowledgeSearchPattern(terms),
            $options: "i",
          },
        })),
      }
    : {};
  const articles = await (await database())
    .collection<KnowledgeArticle>("knowledge_articles")
    .find(filter)
    .sort({ _id: 1 })
    .limit(50)
    .toArray();
  const score = (article: KnowledgeArticle) => {
    const title = normalizeProblem(article.title);
    const keywords = normalizeProblem(article.keywords.join(" "));
    return terms.reduce(
      (total, term) =>
        total +
        (title.includes(term)
          ? 3
          : keywords.includes(term)
            ? 2
            : normalizeProblem(article.content).includes(term)
              ? 1
              : 0),
      0,
    );
  };
  return search
    ? articles.sort((a, b) => score(b) - score(a) || a._id.localeCompare(b._id))
    : articles;
}

export async function findKnowledgeArticle(id: string) {
  return (await database())
    .collection<KnowledgeArticle>("knowledge_articles")
    .findOne({ _id: id });
}

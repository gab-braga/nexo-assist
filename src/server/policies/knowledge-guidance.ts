import type { KnowledgeArticle } from "@/types/tickets";

/** Conservative guard: restricted Windows procedures are withheld without a matching environment. */
export function knowledgeGuidance(
  article: KnowledgeArticle,
  environment?: string,
) {
  const restrictions = article.applicability.join(" ");
  const windows = [...restrictions.matchAll(/Windows\s*(10|11)/gi)].map(
    (match) => match[1],
  );
  const version = environment?.match(/Windows\s*(10|11)/i)?.[1];
  const exclusive = restrictions.match(
    /(?:somente|apenas)\s+Windows\s*(10|11)/i,
  )?.[1];
  const requiresEnvironment =
    windows.length > 0 &&
    (!environment?.trim() || (/Windows/i.test(environment) && !version));
  const applicable =
    !requiresEnvironment &&
    (!exclusive || exclusive === version) &&
    (!windows.length || windows.includes(version!));
  return {
    ...article,
    content: applicable ? article.content.slice(0, 2000) : null,
    applicable,
    requiresEnvironment,
    truncated: applicable && article.content.length > 2000,
    guidance: requiresEnvironment
      ? "Pergunte o sistema operacional e a versão antes de orientar."
      : !applicable
        ? "Não aplique este procedimento neste ambiente. Ofereça abertura de chamado."
        : "Verifique todas as condições do artigo e pergunte se resolveu.",
  };
}

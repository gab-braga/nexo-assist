import { normalizeProblem } from "./tickets";

const stopWords = new Set([
  "como",
  "para",
  "com",
  "uma",
  "meu",
  "minha",
  "nao",
  "consigo",
  "preciso",
  "esta",
  "sobre",
  "qual",
  "que",
  "por",
  "favor",
]);

const related = [
  ["vpn", "conexao remota", "rede privada", "acesso remoto"],
  ["senha", "password"],
  ["email", "e mail", "outlook", "correio"],
  ["equipamento", "monitor", "notebook"],
  ["software", "programa", "aplicativo", "instalar", "instalacao"],
  ["horario", "expediente", "plantao"],
];

/** Small, explicit lexical expansion, not semantic retrieval or generated knowledge. */
export function knowledgeSearchTerms(search: string) {
  const normalized = normalizeProblem(search);
  const words = normalized
    .split(" ")
    .filter((word) => word.length >= 3 && !stopWords.has(word))
    .slice(0, 8);
  const aliases = related
    .filter((group) =>
      group.some((term) => ` ${normalized} `.includes(` ${term} `)),
    )
    .flat();
  return [...new Set([...words, ...aliases])].slice(0, 20);
}

export function knowledgeSearchPattern(terms: string[]) {
  const accents: Record<string, string> = {
    a: "[aáàâãä]",
    e: "[eéèêë]",
    i: "[iíìîï]",
    o: "[oóòôõö]",
    u: "[uúùûü]",
    c: "[cç]",
  };
  return terms
    .map((term) =>
      [...term]
        .map(
          (character) =>
            accents[character] ??
            character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        )
        .join(""),
    )
    .join("|");
}

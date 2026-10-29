/** Shared, deterministic preview of the first message; no model invocation. */
export function conversationTitle(text: string) {
  const words = text.trim().replace(/\s+/gu, " ").split(" ");
  const preview = words.slice(0, 10).join(" ");
  const characters = Array.from(preview);
  if (words.length <= 10 && characters.length <= 80) return preview;
  const shortened = characters.slice(0, 79).join("");
  const boundary = shortened.lastIndexOf(" ");
  return (
    (characters.length > 80 && boundary > 0
      ? shortened.slice(0, boundary)
      : shortened
    ).trimEnd() + "…"
  );
}

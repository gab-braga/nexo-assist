import type { MessageDTO } from "@/types/domain";

export function messageProcessingFeedback(message?: MessageDTO) {
  if (
    !message?.runId ||
    !message.processingState ||
    message.processingState === "completed"
  )
    return null;
  if (message.processingState === "processing")
    return {
      error: false,
      text: "O assistente está processando esta mensagem. O histórico será atualizado automaticamente.",
    };
  if (message.processingState === "interrupted")
    return {
      error: true,
      text: "A resposta anterior foi interrompida. O histórico foi preservado e nenhuma operação será repetida automaticamente. Você pode continuar a conversa.",
    };
  return {
    error: true,
    text: "O assistente não concluiu a resposta anterior. Sua mensagem foi preservada; você pode continuar a conversa.",
  };
}

/**
 * Middleware y Gestor de Contexto: Sliding Window y Truncamiento de Historial
 * Evita superar la ventana de contexto del modelo y previene errores 400 Bad Request.
 */

export interface MessageInput {
  role: string;
  content: string;
  name?: string;
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Regla empírica: ~3.5 a 4 caracteres por token para texto mixto (código, español, inglés)
  return Math.ceil(text.length / 3.8);
}

export function pruneMessagesForContext(
  messages: MessageInput[],
  maxTokens = 64000
): MessageInput[] {
  if (!messages || messages.length === 0) return [];

  // Separar system prompts para preservarlos prioritariamente
  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  let systemTokenBudget = 0;
  for (const sys of systemMessages) {
    systemTokenBudget += estimateTokenCount(sys.content);
  }

  const availableTokens = Math.max(1000, maxTokens - systemTokenBudget);
  let currentTokens = 0;
  const prunedNonSystem: MessageInput[] = [];

  // Recorrer de más reciente a más antiguo (sliding window)
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const msg = nonSystemMessages[i];
    const tokenCount = estimateTokenCount(msg.content);

    if (currentTokens + tokenCount > availableTokens && prunedNonSystem.length > 0) {
      break;
    }

    currentTokens += tokenCount;
    prunedNonSystem.unshift(msg);
  }

  // Garantizar que el primer mensaje no sea del modelo/assistant
  while (prunedNonSystem.length > 0 && prunedNonSystem[0].role === 'assistant') {
    prunedNonSystem.shift();
  }

  return [...systemMessages, ...prunedNonSystem];
}

/**
 * Compresión de contexto (compaction) inspirada en el deepseek-harness.
 *
 * Cuando el historial excede el umbral de la ventana del modelo, en lugar de
 * simplemente descartar los mensajes más antiguos (lo que haría que el modelo
 * "olvidara" el inicio), se genera un resumen de lo descartado que se inyecta
 * como un mensaje de sistema contextual. La cola reciente se conserva verbatim
 * para preservar el flujo inmediato.
 */

import { MessageInput, estimateTokenCount } from './context-manager';

export interface CompactionResult {
  messages: MessageInput[];
  windowTokens: number;
  usedTokens: number;
  isCompacting: boolean;
  summarized: boolean;
}

const DEFAULT_WINDOW = 64_000;

/**
 * Genera un resumen extractivo en bullet points del historial descartado.
 * No requiere llamada al modelo (sin coste) y captura la esencia de cada turno.
 */
function buildContextSummary(discarded: MessageInput[]): string {
  if (!discarded.length) return '';
  const lines: string[] = [];

  for (const msg of discarded) {
    const role = msg.role === 'user' ? 'Usuario' : msg.role === 'assistant' ? 'Asistente' : 'Sistema';
    const text = msg.content || '';
    // Conservar el inicio de cada mensaje para capturar su intención
    const snippet = text.length > 420 ? `${text.slice(0, 420)}…` : text;
    lines.push(`- [${role}]: ${snippet.replace(/\n+/g, ' ').trim()}`);
  }

  return [
    '<compacted-summary>',
    'Resumen de turnos anteriores de esta conversación (contexto reducido por límite de ventana):',
    ...lines,
    '</compacted-summary>',
  ].join('\n');
}

/**
 * Determina si el historial necesita compactarse y, de ser así, construye los
 * nuevos mensajes que combinan un resumen del inicio con la cola reciente.
 */
export function compactContext(
  messages: MessageInput[],
  maxTokens: number = DEFAULT_WINDOW,
  includeSystem = true
): CompactionResult {
  const original = messages || [];
  const threshold = Math.floor(maxTokens * 0.8);

  let usedTokens = 0;
  for (const m of original) {
    usedTokens += estimateTokenCount(m.content || '');
  }

  // Sin presión de contexto: no tocar nada
  if (usedTokens <= threshold) {
    return { messages: original, windowTokens: maxTokens, usedTokens, isCompacting: false, summarized: false };
  }

  // Fallback determinista (sliding window) si no hay historial extensible
  const systemMessages = includeSystem ? original.filter((m) => m.role === 'system') : [];
  const nonSystem = original.filter((m) => m.role !== 'system');

  if (nonSystem.length <= 2) {
    return { messages: original, windowTokens: maxTokens, usedTokens, isCompacting: true, summarized: false };
  }

  // Aplicar sliding window para quedarnos con la cola reciente
  let current = 0;
  let windowTokensUsed = 0;
  const kept: MessageInput[] = [];
  for (let i = nonSystem.length - 1; i >= 0; i--) {
    const t = estimateTokenCount(nonSystem[i].content || '');
    if (windowTokensUsed + t > maxTokens && kept.length > 0) break;
    windowTokensUsed += t;
    kept.unshift(nonSystem[i]);
    current++;
  }
  // Mantener mínimo dos turnos recientes
  const tail = current >= 2 ? kept : nonSystem.slice(-2);
  const discarded = current >= 2 ? nonSystem.slice(0, nonSystem.length - current) : nonSystem.slice(0, nonSystem.length - 2);

  const summary = buildContextSummary(discarded);

  const summaryMessage: MessageInput = {
    role: 'system',
    content: summary,
  };

  return {
    messages: [...(includeSystem ? systemMessages : []), ...(summary ? [summaryMessage] : []), ...tail],
    windowTokens: maxTokens,
    usedTokens,
    isCompacting: true,
    summarized: summary.length > 0,
  };
}

export function windowSizeForContextLength(contextLength?: number): number {
  if (!contextLength || contextLength <= 0) return DEFAULT_WINDOW;
  // Reservar margen para el system prompt y la propia respuesta
  return Math.max(8_000, Math.min(contextLength, 200_000));
}

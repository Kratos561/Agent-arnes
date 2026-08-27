/**
 * Protocolo agéntico "ASK THE USER" para Agent Arnes.
 *
 * El modelo puede pausar su ejecución y preguntar al usuario mediante un bloque
 * estructurado incrustado en su respuesta. La UI detecta el bloque, lo separa del
 * texto visible y lo renderiza como una tarjeta de pregunta interactiva. Cuando el
 * usuario responde, esa respuesta se reenvía al modelo para continuar la tarea
 * (un bucle real agente -> humano -> agente).
 *
 * Formato que el modelo debe emitir:
 *
 *   :::ask
 *   {"id":"q1","question":"¿Qué quieres que haga?","options":["Opción A","Opción B"],"multiple":false}
 *   :::
 *
 * Campos opcionales:
 *   - options:      lista de opciones (botones). Si se omite, se responde con texto libre.
 *   - multiple:     permite seleccionar varias opciones (requiere options).
 *   - placeholder:  texto guía del campo de respuesta libre.
 *   - hideOptions:  oculta las opciones mostrando solo el campo de texto.
 */

import { AskPayload } from './types';

const ASK_OPEN = ':::ask';
const ASK_CLOSE = ':::';

export interface ParsedAsk {
  asks: AskPayload[];
  text: string;
  consumed: boolean;
}

function extractJSON(raw: string): AskPayload | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.substring(start, end + 1));
    if (!obj || typeof obj.id !== 'string' || typeof obj.question !== 'string') return null;
    return {
      id: obj.id,
      question: obj.question,
      options: Array.isArray(obj.options) ? obj.options.map(String) : undefined,
      multiple: Boolean(obj.multiple),
      placeholder: typeof obj.placeholder === 'string' ? obj.placeholder : undefined,
      hideOptions: Boolean(obj.hideOptions),
    };
  } catch {
    return null;
  }
}

/**
 * Extrae todos los bloques `ask` del contenido del asistente, eliminándolos
 * del texto visible. Devuelve el texto "limpio" y la lista de preguntas.
 */
export function parseAskBlocks(content: string): ParsedAsk {
  if (!content || !content.includes(ASK_OPEN)) {
    return { asks: [], text: content || '', consumed: false };
  }
  const asks: AskPayload[] = [];
  const outputParts: string[] = [];
  let cursor = 0;
  let consumed = false;

  while (true) {
    const openIdx = content.indexOf(ASK_OPEN, cursor);
    if (openIdx === -1) {
      outputParts.push(content.substring(cursor));
      break;
    }
    outputParts.push(content.substring(cursor, openIdx));

    const afterOpen = openIdx + ASK_OPEN.length;
    const openLineEnd = content.indexOf('\n', afterOpen);
    const blockStart = openLineEnd === -1 ? content.length : openLineEnd + 1;

    // Buscar el cierre en una línea independiente (ignora el primer `:::` delimitador)
    let closeIdx = -1;
    let searchFrom = blockStart;
    while (searchFrom < content.length) {
      const candidate = content.indexOf(ASK_CLOSE, searchFrom);
      if (candidate === -1) break;
      // El cierre debe estar al inicio de línea (o ser el final del texto)
      const lineStart = content.lastIndexOf('\n', candidate - 1) + 1;
      const before = content.substring(lineStart, candidate);
      if (before.trim() === '') {
        closeIdx = candidate;
        break;
      }
      searchFrom = candidate + ASK_CLOSE.length;
    }

    if (closeIdx === -1) {
      // Bloque sin cerrar: tratamos el resto como texto visible
      outputParts.push(content.substring(afterOpen));
      break;
    }

    const raw = content.substring(blockStart, closeIdx);
    const ask = extractJSON(raw);
    if (ask) {
      asks.push(ask);
      consumed = true;
    } else {
      // No era un ask válido; conservamos el texto literal
      outputParts.push(content.substring(openIdx, closeIdx + ASK_CLOSE.length));
    }

    const closeLineEnd = content.indexOf('\n', closeIdx);
    cursor = closeLineEnd === -1 ? content.length : closeLineEnd + 1;
  }

  return { asks, text: outputParts.join('').trim(), consumed };
}

/**
 * Instrucciones de protocolo que se inyectan en el system prompt para que el
 * modelo sepa cuándo y cómo hacer preguntas al usuario.
 */
export const ASK_PROTOCOL_INSTRUCTIONS = `## Protocolo "Ask the User" (preguntar al humano)
Eres un agente proactivo: cuando necesites una decisión, preferencia o dato que solo el usuario puede aportar, NO inventes ni supongas. Pausa y pregunta.

Para preguntar, emite un bloque \`ask\` en tu respuesta con formato JSON:
:::ask
{"id":"pregunta1","question":"Escribe aquí la pregunta concreta","options":["Opción A","Opción B"],"multiple":false}
:::

Reglas:
- IDENTIFICA cada pregunta con un \`id\` corto y único (ej: "pregunta1").
- Usa \`options\` cuando haya 2-6 respuestas discretas que se puedan tocar (recomendado).
- Usa \`multiple:true\` solo si el usuario debe poder elegir varias.
- Si la respuesta es abierta (texto, cantidad, explicación), omite \`options\` y deja solo \`question\`.
- Puedes emitir texto normal ANTES del bloque \`ask\` (contexto) y DESPUÉS (indicaciones), pero recuerda: nada de lo que escribas tras la pregunta se ejecuta hasta que responda.
- Cuando el usuario responda, continuarás automáticamente con la misma conversación.`;

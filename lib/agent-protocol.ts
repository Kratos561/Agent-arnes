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
const ASK_OPEN_ALT = ':::id';
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
 * Extrae todos los bloques ask del contenido del asistente, eliminándolos
 * del texto visible. Soporta tanto :::ask como :::id.
 */
export function parseAskBlocks(content: string): ParsedAsk {
  if (!content || (!content.includes(ASK_OPEN) && !content.includes(ASK_OPEN_ALT))) {
    return { asks: [], text: content || '', consumed: false };
  }
  const asks: AskPayload[] = [];
  const outputParts: string[] = [];
  let cursor = 0;
  let consumed = false;

  while (true) {
    // Find next ask block (either :::ask or :::id)
    const openIdxAsk = content.indexOf(ASK_OPEN, cursor);
    const openIdxId = content.indexOf(ASK_OPEN_ALT, cursor);
    let openIdx: number;
    let openLen: number;
    if (openIdxAsk === -1 && openIdxId === -1) {
      openIdx = -1;
      openLen = 0;
    } else if (openIdxAsk === -1) {
      openIdx = openIdxId;
      openLen = ASK_OPEN_ALT.length;
    } else if (openIdxId === -1) {
      openIdx = openIdxAsk;
      openLen = ASK_OPEN.length;
    } else {
      if (openIdxAsk < openIdxId) {
        openIdx = openIdxAsk;
        openLen = ASK_OPEN.length;
      } else {
        openIdx = openIdxId;
        openLen = ASK_OPEN_ALT.length;
      }
    }

    if (openIdx === -1) {
      outputParts.push(content.substring(cursor));
      break;
    }
    outputParts.push(content.substring(cursor, openIdx));

    const afterOpen = openIdx + openLen;
    const openLineEnd = content.indexOf('\n', afterOpen);
    const blockStart = openLineEnd === -1 ? content.length : openLineEnd + 1;

    // Search for closing ::: on its own line
    let closeIdx = -1;
    let searchFrom = blockStart;
    while (searchFrom < content.length) {
      const candidate = content.indexOf(ASK_CLOSE, searchFrom);
      if (candidate === -1) break;
      const lineStart = content.lastIndexOf('\n', candidate - 1) + 1;
      const before = content.substring(lineStart, candidate);
      if (before.trim() === '') {
        closeIdx = candidate;
        break;
      }
      searchFrom = candidate + ASK_CLOSE.length;
    }

    if (closeIdx === -1) {
      outputParts.push(content.substring(afterOpen));
      break;
    }

    const raw = content.substring(blockStart, closeIdx);
    const ask = extractJSON(raw);
    if (ask) {
      asks.push(ask);
      consumed = true;
    } else {
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
Eres un agente proactivo: cuando necesites una decision, preferencia o dato que solo el usuario puede aportar, NO inventes ni supongas. Pausa y pregunta.

Para preguntar, emite un bloque ASK en tu respuesta con formato JSON EXACTO:

:::ask
{"id":"pregunta1","question":"Escribe aqui la pregunta concreta","options":["Opcion A","Opcion B"],"multiple":false}
:::

REGLAS:
- IDENTIFICA cada pregunta con un id corto y unico (ej: "pregunta1").
- Usa options cuando haya 2-6 respuestas discretas que se puedan tocar (recomendado).
- Usa multiple:true solo si el usuario debe poder elegir varias.
- Si la respuesta es abierta (texto, cantidad, explicacion), omite options y deja solo question.
- Puedes emitir texto normal ANTES del bloque ask (contexto) y DESPUES (indicaciones), pero recuerda: nada de lo que escribas tras la pregunta se ejecuta hasta que responda.
- Cuando el usuario responda, continuaras automaticamente con la misma conversacion.
- NO uses :::id como delimitador — usa SIEMPRE :::ask y ::: para abrir y cerrar.`;

/**
 * FSM (Finite State Machine) para el procesamiento y aislamiento robusto de streams SSE,
 * bloques de razonamiento (<think>...</think>) y bloques de código.
 */

export const StreamState = {
  TEXT: 'TEXT',
  REASONING: 'REASONING',
  CODE_BLOCK: 'CODE_BLOCK',
} as const;

export type StreamState = (typeof StreamState)[keyof typeof StreamState];

export interface ParsedBlock {
  type: StreamState;
  content: string;
  language?: string;
  isComplete: boolean;
}

export interface ParsedStreamResult {
  reasoning: string;
  content: string;
  isReasoningComplete: boolean;
}

export class StreamFSMParser {
  private buffer = '';
  private state: StreamState = StreamState.TEXT;
  private currentLanguage = '';

  public reset() {
    this.buffer = '';
    this.state = StreamState.TEXT;
    this.currentLanguage = '';
  }

  public processChunk(chunk: string, isFinal = false): ParsedBlock[] {
    this.buffer += chunk;
    const blocks: ParsedBlock[] = [];
    let cursor = 0;

    while (cursor < this.buffer.length) {
      switch (this.state) {
        case StreamState.TEXT: {
          const thinkStart = this.buffer.indexOf('<think>', cursor);
          const codeBlockStart = this.buffer.indexOf('```', cursor);

          let nextSpecial = -1;
          let targetState: StreamState = StreamState.TEXT;

          if (thinkStart !== -1 && (codeBlockStart === -1 || thinkStart < codeBlockStart)) {
            nextSpecial = thinkStart;
            targetState = StreamState.REASONING;
          } else if (codeBlockStart !== -1) {
            nextSpecial = codeBlockStart;
            targetState = StreamState.CODE_BLOCK;
          }

          if (nextSpecial !== -1) {
            if (nextSpecial > cursor) {
              blocks.push({
                type: StreamState.TEXT,
                content: this.buffer.substring(cursor, nextSpecial),
                isComplete: true,
              });
            }

            if (targetState === StreamState.REASONING) {
              this.state = StreamState.REASONING;
              cursor = nextSpecial + 7; // Length of '<think>'
            } else if (targetState === StreamState.CODE_BLOCK) {
              this.state = StreamState.CODE_BLOCK;
              const newlineIdx = this.buffer.indexOf('\n', nextSpecial + 3);
              if (newlineIdx !== -1) {
                this.currentLanguage = this.buffer.substring(nextSpecial + 3, newlineIdx).trim();
                cursor = newlineIdx + 1;
              } else {
                this.currentLanguage = this.buffer.substring(nextSpecial + 3).trim();
                cursor = this.buffer.length;
              }
            }
          } else {
            blocks.push({
              type: StreamState.TEXT,
              content: this.buffer.substring(cursor),
              isComplete: isFinal,
            });
            cursor = this.buffer.length;
          }
          break;
        }

        case StreamState.REASONING: {
          const thinkEnd = this.buffer.indexOf('</think>', cursor);
          if (thinkEnd !== -1) {
            blocks.push({
              type: StreamState.REASONING,
              content: this.buffer.substring(cursor, thinkEnd),
              isComplete: true,
            });
            this.state = StreamState.TEXT;
            cursor = thinkEnd + 8; // Length of '</think>'
          } else {
            blocks.push({
              type: StreamState.REASONING,
              content: this.buffer.substring(cursor),
              isComplete: isFinal,
            });
            cursor = this.buffer.length;
          }
          break;
        }

        case StreamState.CODE_BLOCK: {
          const codeBlockEnd = this.buffer.indexOf('```', cursor);
          if (codeBlockEnd !== -1) {
            blocks.push({
              type: StreamState.CODE_BLOCK,
              language: this.currentLanguage,
              content: this.buffer.substring(cursor, codeBlockEnd),
              isComplete: true,
            });
            this.state = StreamState.TEXT;
            this.currentLanguage = '';
            cursor = codeBlockEnd + 3;
          } else {
            blocks.push({
              type: StreamState.CODE_BLOCK,
              language: this.currentLanguage,
              content: this.buffer.substring(cursor),
              isComplete: isFinal,
            });
            cursor = this.buffer.length;
          }
          break;
        }
      }
    }

    return blocks;
  }
}

/**
 * Función utilitaria optimizada para extraer razonamiento y contenido final
 * garantizando que las etiquetas abiertas no queden en estado colgado si el stream se corta.
 */
export function parseStreamContent(rawStream: string, isDone = false): ParsedStreamResult {
  if (!rawStream) {
    return { reasoning: '', content: '', isReasoningComplete: true };
  }

  const thinkOpenIndex = rawStream.indexOf('<think>');
  const thinkCloseIndex = rawStream.indexOf('</think>');

  // Caso 1: <think> abierto pero sin </think>
  if (thinkOpenIndex !== -1 && thinkCloseIndex === -1) {
    const reasoning = rawStream.substring(thinkOpenIndex + 7);
    return {
      reasoning,
      content: '',
      isReasoningComplete: isDone, // Si el stream ya terminó, forzamos completado
    };
  }

  // Caso 2: <think> y </think> cerrados
  if (thinkOpenIndex !== -1 && thinkCloseIndex !== -1) {
    const reasoning = rawStream.substring(thinkOpenIndex + 7, thinkCloseIndex);
    const content = rawStream.substring(thinkCloseIndex + 8);
    return {
      reasoning,
      content,
      isReasoningComplete: true,
    };
  }

  // Caso 3: </think> huérfano sin <think>
  if (thinkOpenIndex === -1 && thinkCloseIndex !== -1) {
    const reasoning = rawStream.substring(0, thinkCloseIndex);
    const content = rawStream.substring(thinkCloseIndex + 8);
    return {
      reasoning,
      content,
      isReasoningComplete: true,
    };
  }

  // Caso estándar: solo texto regular
  return {
    reasoning: '',
    content: rawStream,
    isReasoningComplete: true,
  };
}

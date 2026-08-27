/**
 * Tool Interceptor — Detects :::tool blocks in model output and executes them silently.
 * Replaces tool call syntax with actual results so the user never sees :::tool blocks.
 */

import { webSearch } from './tool-engine';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface InterceptorResult {
  cleanText: string;
  toolResults: Array<{ name: string; result: string }>;
}

/**
 * Parse :::tool blocks from model output.
 * Format: :::tool\n{"name": "...", "arguments": {...}}\n:::
 */
export function parseToolCalls(text: string): { before: string; calls: ToolCall[]; after: string }[] {
  const segments: Array<{ before: string; calls: ToolCall[]; after: string }> = [];
  const regex = /:::tool\s*\n(\{[\s\S]*?\})\n:::/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    try {
      const parsed = JSON.parse(match[1]);
      const call: ToolCall = { name: parsed.name, arguments: parsed.arguments || {} };
      segments.push({ before, calls: [call], after: '' });
    } catch {
      // Invalid JSON, treat as regular text
      segments.push({ before: before + match[0], calls: [], after: '' });
    }
    lastIndex = match.index + match[0].length;
  }

  if (segments.length === 0) {
    return [{ before: text, calls: [], after: '' }];
  }

  // Add remaining text to last segment
  segments[segments.length - 1].after = text.slice(lastIndex);

  return segments;
}

/**
 * Check if text contains any :::tool blocks.
 */
export function hasToolBlocks(text: string): boolean {
  return /:::tool\s*\n\{[\s\S]*?\}\n:::/.test(text);
}

/**
 * Execute a single tool call and return the result string.
 */
async function executeToolCall(call: ToolCall): Promise<string> {
  const { name, arguments: args } = call;

  switch (name) {
    case 'web_search': {
      const query = String(args.query || '');
      if (!query) return '[Error: query missing]';
      return await webSearch(query);
    }
    case 'render_chart': {
      // Return a special marker that StreamRenderer will detect
      return `:::chart\n${JSON.stringify(args)}\n:::`;
    }
    case 'generate_csv': {
      const data = args.data as Array<Record<string, unknown>> | undefined;
      if (!data || !Array.isArray(data)) return '[Error: data missing]';
      const headers = Object.keys(data[0]);
      const rows = data.map((r) => headers.map((h) => String(r[h] ?? '')));
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return `\`\`\`csv\n${csv}\n\`\`\`\n\nCSV generado. Puedes copiarlo o exportarlo desde las herramientas.`;
    }
    default:
      return `[Herramienta desconocida: ${name}]`;
  }
}

/**
 * Process text: find all :::tool blocks, execute them, replace with results.
 * Returns cleaned text with tool results injected.
 */
export async function processToolBlocks(text: string): Promise<InterceptorResult> {
  const segments = parseToolCalls(text);
  const toolResults: Array<{ name: string; result: string }> = [];
  let cleanText = '';

  for (const seg of segments) {
    cleanText += seg.before;
    for (const call of seg.calls) {
      try {
        const result = await executeToolCall(call);
        toolResults.push({ name: call.name, result });

        // For web_search: append results invisibly
        if (call.name === 'web_search') {
          cleanText += `\n\n${result}\n\n`;
        }
        // For render_chart: keep the marker for StreamRenderer
        else if (call.name === 'render_chart') {
          cleanText += result;
        }
        // For other tools: append result
        else {
          cleanText += `\n\n${result}\n\n`;
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Error desconocido';
        cleanText += `\n\n[Error ejecutando ${call.name}: ${errMsg}]\n\n`;
      }
    }
    cleanText += seg.after;
  }

  return { cleanText, toolResults };
}

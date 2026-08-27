/**
 * Tool Interceptor — Detects tool calls in model output and executes them silently.
 * Handles multiple formats:
 *   1. :::tool\n{JSON}\n::: (standard)
 *   2. Tool: tool_name param: value (natural language fallback)
 *   3. :::id (ask protocol - handled separately)
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
 * Parse :::tool blocks (JSON format) from model output.
 */
function parseJsonToolBlocks(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const regex = /:::tool\s*\n(\{[\s\S]*?\})\n:::/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed.name && typeof parsed.name === 'string') {
        calls.push({ name: parsed.name, arguments: parsed.arguments || {}, _raw: m[0] } as ToolCall & { _raw: string });
      }
    } catch { /* skip */ }
  }
  return calls;
}

/**
 * Parse natural language tool calls like "Tool: web_search query: ..." or
 * "Tool: render_chart type: bar labels: [...] data: [...]"
 */
function parseNaturalToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  // Match lines like: Tool: web_search query: DeepSeek AI 2026
  // or: Tool: render_chart type: bar
  const lineRegex = /(?:^|\n)\s*(?:Tool|Herramienta):\s*(\w+)\s+(\w+):\s*(.+?)(?=\n|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(text)) !== null) {
    const toolName = m[1].toLowerCase();
    const param = m[2].toLowerCase();
    const value = m[3].trim();
    if (toolName === 'web_search' || toolName === 'busqueda_web' || toolName === 'search') {
      calls.push({ name: 'web_search', arguments: { query: value } });
    } else if (toolName === 'render_chart' || toolName === 'grafica' || toolName === 'chart') {
      // Try to parse as key-value pairs
      const args: Record<string, unknown> = {};
      args[param] = tryParseValue(value);
      calls.push({ name: 'render_chart', arguments: args });
    }
  }

  // Also match: Tool: web_search\nquery: DeepSeek AI
  // where tool and param are on different lines
  const blockRegex = /(?:^|\n)\s*(?:Tool|Herramienta):\s*(\w+)\s*\n\s*(\w+):\s*([\s\S]+?)(?=\n(?:Tool|Herramienta):|\n\n|$)/gi;
  while ((m = blockRegex.exec(text)) !== null) {
    const toolName = m[1].toLowerCase();
    const param = m[2].toLowerCase();
    const value = m[3].trim();
    if (!calls.some(c => c.name === 'web_search' && c.arguments.query === value)) {
      if (toolName === 'web_search' || toolName === 'busqueda_web' || toolName === 'search') {
        calls.push({ name: 'web_search', arguments: { query: value } });
      }
    }
  }

  return calls;
}

function tryParseValue(v: string): unknown {
  if (v.startsWith('[') || v.startsWith('{')) {
    try { return JSON.parse(v); } catch { /* continue */ }
  }
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

/**
 * Check if text contains any tool call patterns.
 */
export function hasToolBlocks(text: string): boolean {
  return /:::tool\s*\n\{[\s\S]*?\}\n:::/.test(text) ||
    /(?:Tool|Herramienta):\s*\w+\s+\w+:/i.test(text);
}

/**
 * Process text: find all tool calls, execute them, replace with results.
 */
export async function processToolBlocks(text: string): Promise<InterceptorResult> {
  const toolResults: Array<{ name: string; result: string }> = [];
  let cleanText = text;

  // 1. Process :::tool JSON blocks
  const jsonRegex = /:::tool\s*\n(\{[\s\S]*?\})\n:::/g;
  let jsonMatch: RegExpExecArray | null;
  while ((jsonMatch = jsonRegex.exec(cleanText)) !== null) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.name) {
        const result = await executeToolCall({ name: parsed.name, arguments: parsed.arguments || {} });
        toolResults.push({ name: parsed.name, result });
        cleanText = cleanText.replace(jsonMatch[0], result);
      }
    } catch {
      cleanText = cleanText.replace(jsonMatch[0], '');
    }
  }

  // 2. Process natural language tool calls
  const naturalCalls = parseNaturalToolCalls(cleanText);
  for (const call of naturalCalls) {
    const result = await executeToolCall(call);
    toolResults.push({ name: call.name, result });
    // Remove the natural language tool call line and replace with result
    const toolLineRegex = new RegExp(
      `(?:^|\\n)\\s*(?:Tool|Herramienta):\\s*${escapeRegex(call.name)}[^\\n]*(?:\\n\\s*\\w+:\\s*[^\\n]*)*`,
      'gi'
    );
    cleanText = cleanText.replace(toolLineRegex, `\n\n${result}\n`);
  }

  // 3. Clean up "Tool call quote block:" headers
  cleanText = cleanText.replace(/Tool call quote block:\s*/gi, '');
  cleanText = cleanText.replace(/\*\*Tool call quote block:\*\*\s*/gi, '');

  return { cleanText: cleanText.trim(), toolResults };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Execute a single tool call and return the result string.
 */
async function executeToolCall(call: ToolCall): Promise<string> {
  const { name, arguments: args } = call;

  switch (name) {
    case 'web_search':
    case 'busqueda_web':
    case 'search': {
      const query = String(args.query || '');
      if (!query) return '[Error: query missing]';
      return await webSearch(query);
    }
    case 'render_chart':
    case 'grafica':
    case 'chart': {
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

/**
 * Native Function Calling — DeepSeek Harness-style tool system.
 *
 * Instead of text-based :::tool blocks with regex parsing, this module provides:
 *   - JSON Schema tool definitions sent via the API `tools` parameter
 *   - Structured tool call detection in API responses (not text parsing)
 *   - Tool execution pipeline with pre-execute → execute → post-execute
 *   - Parallel execution for concurrency-safe tools
 *   - Streaming tool call detection (tool-call-delta during SSE)
 */

import { webSearch } from './tool-engine';

// ===== Tool Schema (OpenAI/DeepSeek compatible JSON Schema) =====

export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameterProperty>;
      required?: string[];
    };
  };
}

export interface NativeToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  result: string;
  success: boolean;
  executionTimeMs: number;
  /** True cuando el bloqueo vino de la política de permisos (no de un fallo). */
  blocked?: boolean;
}

export interface ToolPipelineContext {
  call: NativeToolCall;
  preResult?: string;
}

export type ToolPreHook = (ctx: ToolPipelineContext) => Promise<string | null>;
export type ToolPostHook = (ctx: ToolPipelineContext, result: ToolResult) => Promise<ToolResult>;

/**
 * Permission checker inyectado por la UI (lee los permisos del store).
 * Si no hay checker, todo lo registrado está permitido; lo desconocido se deniega.
 */
let permissionChecker: ((toolName: string) => boolean) | null = null;

export function setToolPermissionChecker(fn: ((toolName: string) => boolean) | null): void {
  permissionChecker = fn;
}

function isAllowedByPolicy(toolName: string): boolean {
  if (permissionChecker) {
    try {
      return permissionChecker(toolName);
    } catch {
      return false;
    }
  }
  return toolExecutors.has(toolName);
}

// ===== Tool Registry =====

const toolSchemas: ToolSchema[] = [];
const toolExecutors: Map<string, (args: Record<string, unknown>) => Promise<string>> = new Map();
const toolConcurrencySafe: Set<string> = new Set();
const preHooks: ToolPreHook[] = [];
const postHooks: ToolPostHook[] = [];

/**
 * Register a tool with schema, executor, and optional concurrency flag.
 */
export function registerTool(
  schema: ToolSchema,
  executor: (args: Record<string, unknown>) => Promise<string>,
  concurrencySafe = false
): void {
  toolSchemas.push(schema);
  toolExecutors.set(schema.function.name, executor);
  if (concurrencySafe) toolConcurrencySafe.add(schema.function.name);
}

/**
 * Register a pre-execution hook (can modify or cancel execution).
 */
export function registerPreHook(hook: ToolPreHook): void {
  preHooks.push(hook);
}

/**
 * Register a post-execution hook (can modify results).
 */
export function registerPostHook(hook: ToolPostHook): void {
  postHooks.push(hook);
}

/**
 * Get all registered tool schemas (for API `tools` parameter).
 */
export function getToolSchemas(): ToolSchema[] {
  return [...toolSchemas];
}

/**
 * Get all registered tool names.
 */
export function getRegisteredToolNames(): string[] {
  return toolSchemas.map((s) => s.function.name);
}

// ===== Tool Execution Pipeline =====

/**
 * Execute a single tool through the pipeline (pre → execute → post).
 */
export async function executeNativeTool(call: NativeToolCall): Promise<ToolResult> {
  const startTime = performance.now();
  const executor = toolExecutors.get(call.name);

  if (!executor) {
    return {
      callId: call.id,
      name: call.name,
      result: `[Error: Tool "${call.name}" not registered]`,
      success: false,
      executionTimeMs: 0,
    };
  }

  const ctx: ToolPipelineContext = { call };

  if (!isAllowedByPolicy(call.name)) {
    return {
      callId: call.id,
      name: call.name,
      result: `[Bloqueado por permisos: "${call.name}" está denegado por el usuario. Ofrece una alternativa manual.]`,
      success: false,
      executionTimeMs: 0,
      blocked: true,
    };
  }

  // Pre-execute hooks
  for (const hook of preHooks) {
    try {
      const override = await hook(ctx);
      if (override !== null) {
        return {
          callId: call.id,
          name: call.name,
          result: override,
          success: true,
          executionTimeMs: performance.now() - startTime,
        };
      }
    } catch (e) {
      return {
        callId: call.id,
        name: call.name,
        result: `[Pre-hook error: ${e instanceof Error ? e.message : String(e)}]`,
        success: false,
        executionTimeMs: performance.now() - startTime,
      };
    }
  }

  // Execute
  let result: string;
  let success = true;
  try {
    result = await executor(call.arguments);
  } catch (e) {
    result = `[Tool error: ${e instanceof Error ? e.message : String(e)}]`;
    success = false;
  }

  const toolResult: ToolResult = {
    callId: call.id,
    name: call.name,
    result,
    success,
    executionTimeMs: performance.now() - startTime,
  };

  // Post-execute hooks
  let finalResult = toolResult;
  for (const hook of postHooks) {
    try {
      finalResult = await hook(ctx, finalResult);
    } catch { /* continue */ }
  }

  return finalResult;
}

/**
 * Execute multiple tool calls. Parallel execution for concurrency-safe tools.
 */
export async function executeNativeTools(calls: NativeToolCall[]): Promise<ToolResult[]> {
  if (calls.length === 0) return [];

  // Group by concurrency safety
  const safe: NativeToolCall[] = [];
  const unsafe: NativeToolCall[] = [];
  for (const call of calls) {
    if (toolConcurrencySafe.has(call.name)) {
      safe.push(call);
    } else {
      unsafe.push(call);
    }
  }

  const results: ToolResult[] = [];

  // Execute safe tools in parallel
  if (safe.length > 0) {
    const safeResults = await Promise.all(safe.map(executeNativeTool));
    results.push(...safeResults);
  }

  // Execute unsafe tools sequentially
  for (const call of unsafe) {
    results.push(await executeNativeTool(call));
  }

  return results;
}

// ===== Response Parsing =====

/**
 * Extract native tool calls from a non-streaming API response.
 */
export function extractToolCallsFromResponse(response: Record<string, unknown>): NativeToolCall[] {
  const choice = (response.choices as any[])?.[0];
  if (!choice) return [];

  const message = choice.message;
  if (!message?.tool_calls || !Array.isArray(message.tool_calls)) return [];

  return message.tool_calls.map((tc: any) => ({
    id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: tc.function?.name || '',
    arguments: safeJsonParse(tc.function?.arguments || '{}'),
  }));
}

/**
 * Extract tool calls from a streaming delta chunk.
 * Returns partial tool call data for incremental assembly.
 */
export function extractToolCallFromDelta(delta: Record<string, unknown>): {
  type: 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | null;
  data: any;
} {
  // Check for tool_calls in delta
  const toolCalls = delta.tool_calls;
  if (!toolCalls || !Array.isArray(toolCalls)) return { type: null, data: null };

  const tc = toolCalls[0];
  if (!tc) return { type: null, data: null };

  // Index 0 with function.name = start of new tool call
  if (tc.index === 0 && tc.id && tc.function?.name) {
    return {
      type: 'tool_call_start',
      data: {
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments || '',
      },
    };
  }

  // Delta with arguments chunk
  if (tc.function?.arguments) {
    return {
      type: 'tool_call_delta',
      data: {
        index: tc.index || 0,
        argumentsChunk: tc.function.arguments,
      },
    };
  }

  // End signal (finish_reason = 'tool_calls')
  return { type: null, data: null };
}

/**
 * Check if a finish reason indicates tool calls.
 */
export function isToolCallsFinishReason(finishReason: string | undefined): boolean {
  return finishReason === 'tool_calls' || finishReason === 'function_call';
}

// ===== Tool Call Assembly (for streaming) =====

interface StreamingToolCallAssembler {
  id: string;
  name: string;
  argumentsBuffer: string;
  complete: boolean;
}

/**
 * Assemble streaming tool call deltas into complete tool calls.
 */
export class ToolCallAssembler {
  private calls: Map<number, StreamingToolCallAssembler> = new Map();

  processDelta(delta: Record<string, unknown>): NativeToolCall[] {
    const toolCalls = delta.tool_calls;
    if (!toolCalls || !Array.isArray(toolCalls)) return [];

    const completed: NativeToolCall[] = [];

    for (const tc of toolCalls) {
      const idx = tc.index ?? 0;

      if (tc.id && tc.function?.name) {
        // New tool call start
        this.calls.set(idx, {
          id: tc.id,
          name: tc.function.name,
          argumentsBuffer: tc.function.arguments || '',
          complete: false,
        });
      } else if (tc.function?.arguments) {
        // Arguments delta
        const existing = this.calls.get(idx);
        if (existing) {
          existing.argumentsBuffer += tc.function.arguments;
        }
      }
    }

    return completed;
  }

  /**
   * Finalize and return all assembled tool calls.
   * Called when finish_reason is 'tool_calls'.
   */
  finish(): NativeToolCall[] {
    const calls: NativeToolCall[] = [];
    for (const [, assembler] of this.calls) {
      calls.push({
        id: assembler.id,
        name: assembler.name,
        arguments: safeJsonParse(assembler.argumentsBuffer || '{}'),
      });
    }
    this.calls.clear();
    return calls;
  }

  reset(): void {
    this.calls.clear();
  }
}

// ===== API Payload Builder =====

/**
 * Build the tools payload for the API request.
 * Only includes tools if there are registered tools.
 */
export function buildToolsPayload(): ToolSchema[] | undefined {
  const schemas = getToolSchemas();
  return schemas.length > 0 ? schemas : undefined;
}

/**
 * Build tool result messages for conversation history.
 */
export function buildToolResultMessages(results: ToolResult[]): Array<{ role: 'tool'; content: string; tool_call_id: string }> {
  return results.map((r) => ({
    role: 'tool' as const,
    content: r.result,
    tool_call_id: r.callId,
  }));
}

/**
 * Build assistant message with tool_calls for conversation history.
 */
export function buildAssistantToolCallMessage(calls: NativeToolCall[]): {
  role: 'assistant';
  content: null;
  tool_calls: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
} {
  return {
    role: 'assistant',
    content: null,
    tool_calls: calls.map((c) => ({
      id: c.id,
      type: 'function' as const,
      function: {
        name: c.name,
        arguments: JSON.stringify(c.arguments),
      },
    })),
  };
}

// ===== Built-in Tools =====

function safeJsonParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}

let _builtinToolsRegistered = false;

/**
 * Register all built-in browser tools.
 */
export function registerBuiltinTools(): void {
  if (_builtinToolsRegistered) return;
  _builtinToolsRegistered = true;
  // web_search
  registerTool(
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web using DuckDuckGo. Returns search results, snippets, and Wikipedia context. Use for current information, statistics, news, or any data you don\'t have.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
          },
          required: ['query'],
        },
      },
    },
    async (args) => webSearch(String(args.query || '')),
    true // concurrency-safe
  );

  // render_chart
  registerTool(
    {
      type: 'function',
      function: {
        name: 'render_chart',
        description: 'Render a chart visualization. Supports bar, line, pie, and doughnut types. Use when the user wants to see trends, comparisons, or distributions.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Chart type',
              enum: ['bar', 'line', 'pie', 'doughnut'],
            },
            labels: {
              type: 'array',
              description: 'X-axis labels or segment labels',
              items: { type: 'string' },
            },
            datasets: {
              type: 'array',
              description: 'Data series',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  data: { type: 'array', items: { type: 'number' } },
                  color: { type: 'string' },
                },
              },
            },
            title: {
              type: 'string',
              description: 'Chart title',
            },
          },
          required: ['type', 'labels', 'datasets'],
        },
      },
    },
    async (args) => `:::chart\n${JSON.stringify(args)}\n:::`,
    false
  );

  // generate_csv
  registerTool(
    {
      type: 'function',
      function: {
        name: 'generate_csv',
        description: 'Generate downloadable CSV data from structured records. Use for tabular data the user can export.',
        parameters: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              description: 'Array of row objects',
              items: {
                type: 'object',
                properties: {
                  // Dynamic properties — allow any string keys
                },
              },
            },
          },
          required: ['data'],
        },
      },
    },
    async (args) => {
      const data = args.data as Array<Record<string, unknown>> | undefined;
      if (!data || !Array.isArray(data)) return '[Error: data missing]';
      const headers = Object.keys(data[0]);
      const rows = data.map((r) => headers.map((h) => String(r[h] ?? '')));
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return `\`\`\`csv\n${csv}\n\`\`\`\n\nCSV generated. You can copy or export it from the tools.`;
    },
    false
  );
}

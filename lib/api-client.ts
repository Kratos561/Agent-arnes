import { ChatMessage, ModelInfo, ModelParameters, ProviderConfig } from './types';
import { compactContext } from './compaction';
import { ASK_PROTOCOL_INSTRUCTIONS } from './agent-protocol';
import { assemblePrompt, AgentRule, AgentSkill, PersonaConfig } from './agent-infra';
import { processToolBlocks, hasToolBlocks } from './tool-interceptor';

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
  onDone: (content: string, reasoning: string, tokens?: { prompt?: number; completion?: number; total?: number }, finishReason?: string) => void;
  onError: (message: string) => void;
}

const localHostPattern = /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i;

// ============================================================================
// CORS Proxy Fallback
// Cuándo un proveedor bloquea las peticiones desde el navegador (CORS), se
// reintenta a través de proxies públicos que reenvían la petición servidor a
// servidor y añaden los headers CORS necesarios. GitHub Pages solo sirve
// estáticos, así que esta es la vía para endpoints sin CORS.
// ============================================================================

const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

function endpoint(baseUrl: string, resource: 'models' | 'chat/completions') {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) throw new Error('Configura una URL base antes de continuar.');
  return normalized.endsWith(`/${resource}`) ? normalized : `${normalized}/${resource}`;
}

function headersFor(provider: ProviderConfig, streaming = false): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: streaming ? 'text/event-stream, application/json' : 'application/json',
    ...(provider.customHeaders || {}),
  };
  if (provider.apiKey.trim()) headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
  return headers;
}

/**
 * Intenta primero la petición directa; si falla por CORS/red, reintenta a
 * través de los proxies públicos hasta agotar la lista.
 * @returns El último error si todos fallan.
 */
async function fetchWithCORSFallback(
  targetUrl: string,
  init: RequestInit,
  provider: ProviderConfig,
  tryProxy: boolean
): Promise<{ response: Response; viaProxy: boolean }> {
  const lastError: Error = new Error('Fallo de red');

  // 1) Intento directo
  try {
    const response = await fetch(targetUrl, init);
    // Si fue exitoso (incluido errores HTTP del propio proveedor), usamos la respuesta
    return { response, viaProxy: false };
  } catch (directError) {
    const isLocal = localHostPattern.test(targetUrl);
    if (isLocal || !tryProxy) throw directError;
    lastError.message = directError instanceof Error ? directError.message : 'Fallo de red';
  }

  // 2) Reintentos vía proxi. El proxy propio (worker del usuario) se usa siempre
  //    que esté configurado; los proxies públicos solo si useProxy no está en false.
  const proxyBuilders: ((u: string) => string)[] = [];
  if (provider.customProxy && provider.customProxy.trim()) {
    const base = provider.customProxy.trim().replace(/\/+$/, '');
    proxyBuilders.push((u: string) => `${base}?url=${encodeURIComponent(u)}`);
  }
  if (tryProxy) {
    proxyBuilders.push(...CORS_PROXIES);
  }

  for (const buildProxyUrl of proxyBuilders) {
    try {
      const proxiedUrl = buildProxyUrl(targetUrl);
      const response = await fetch(proxiedUrl, init);
      return { response, viaProxy: true };
    } catch (proxyError) {
      lastError.message = proxyError instanceof Error ? proxyError.message : 'Fallo de red';
    }
  }

  throw lastError;
}

function corsHint(provider: ProviderConfig, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  if (!localHostPattern.test(provider.baseUrl)) {
    return `${detail}. El proveedor bloqueó la petición desde el navegador (CORS) o rechaza las IPs de los proxies. Se ha intentado reenviar vía proxy sin éxito. Recomendación: usa un proveedor compatible con CORS (OpenRouter, Groq, DeepSeek, Mistral) o una clave de OpenRouter para acceder a los mismos modelos de OpenAI/Anthropic directamente.`;
  }
  return detail;
}

/** Consulta /models directamente desde el navegador; no depende de una ruta API propia. */
export async function fetchModels(provider: ProviderConfig): Promise<{ success: boolean; models: ModelInfo[]; error?: string; viaProxy?: boolean }> {
  try {
    const { response, viaProxy } = await fetchWithCORSFallback(
      endpoint(provider.baseUrl, 'models'),
      { headers: headersFor(provider) },
      provider,
      provider.useProxy !== false
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) return { success: false, models: [], error: body?.error?.message || body?.message || `Error HTTP ${response.status}` };
    const entries = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
    return {
      success: true,
      viaProxy,
      models: entries.map((model: Record<string, unknown>) => ({
        id: String(model.id || model.name || ''),
        name: String(model.name || model.id || ''),
        description: typeof model.description === 'string' ? model.description : undefined,
        context_length: typeof model.context_length === 'number' ? model.context_length : undefined,
        owned_by: typeof model.owned_by === 'string' ? model.owned_by : undefined,
      })).filter((model: ModelInfo) => model.id),
    };
  } catch (error) {
    return { success: false, models: [], error: corsHint(provider, error) };
  }
}

export interface DiagnosticAttempt {
  attempt: string;
  ok: boolean;
  kind: 'ok' | 'http_error' | 'cors' | 'network' | 'timeout';
  status?: number;
  detail: string;
}

/** Diagnóstico de conectividad: prueba la petición directa y cada proxy por separado, mostrando el resultado individual. */
export async function diagnoseConnection(provider: ProviderConfig): Promise<{ target: string; attempts: DiagnosticAttempt[] }> {
  const target = endpoint(provider.baseUrl, 'models');
  const attempts: DiagnosticAttempt[] = [];

  const run = async (label: string, url: string): Promise<DiagnosticAttempt> => {
    const started = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { headers: headersFor(provider), signal: ctrl.signal });
      const body = await res.json().catch(() => null);
      const status = res.status;
      const ms = Math.round(performance.now() - started);
      if (res.ok) {
        return { attempt: label, ok: true, kind: 'ok', status, detail: `Éxito (${ms}ms) — ${body?.choices?.[0]?.message?.content ?? body?.data?.length !== undefined ? `${(body.data?.length ?? 0)} modelos` : 'respuesta válida'}` };
      }
      return { attempt: label, ok: false, kind: 'http_error', status, detail: `HTTP ${status} (${ms}ms): el servidor respondió (no es bloqueo de red). ${body?.error?.message || body?.message || ''}` };
    } catch (err: any) {
      const ms = Math.round(performance.now() - started);
      const aborted = err?.name === 'AbortError';
      if (aborted) return { attempt: label, ok: false, kind: 'timeout', detail: `Timeout (más de 15s, ${ms}ms)` };
      const name = err?.name || '';
      const msg = err?.message || String(err);
      // "Failed to fetch" / TypeError sin respuesta = bloqueo CORS o de red
      const isCors = msg.includes('Failed to fetch') || msg.includes('NetworkError') || name === 'TypeError';
      return { attempt: label, ok: false, kind: isCors ? 'cors' : 'network', detail: `${name}: ${msg} (${ms}ms)${isCors ? ' — el navegador bloqueó la petición (CORS o red)' : ''}` };
    } finally {
      clearTimeout(timer);
    }
  };

  attempts.push(await run('Directo (sin proxy)', target));

  if (provider.customProxy && provider.customProxy.trim()) {
    const base = provider.customProxy.trim().replace(/\/+$/, '');
    const url = `${base}?url=${encodeURIComponent(target)}`;
    attempts.push(await run(`Proxy propio: ${new URL(base).host}`, url));
  }

  if (provider.useProxy !== false) {
    for (const buildProxyUrl of CORS_PROXIES) {
      attempts.push(await run(`Proxy: ${new URL(buildProxyUrl(target)).host}`, buildProxyUrl(target)));
    }
  }

  return { target, attempts };
}

/** Prompt de ejecución de alto rendimiento: ensambla el system prompt con todas las secciones del harness. */
export function buildHarnessSystemPrompt(
  provider: ProviderConfig,
  modelId: string,
  customPrompt?: string,
  activeRules?: AgentRule[],
  activeSkills?: AgentSkill[],
  persona?: PersonaConfig,
  sessionPrompt?: string,
) {
  return assemblePrompt({
    provider,
    modelId,
    customPrompt,
    activeRules: activeRules || [],
    activeSkills: activeSkills || [],
    persona: persona || { id: 'default', name: 'Default', text: '', isActive: true },
    sessionPrompt,
  });
}

function extractDelta(payload: Record<string, any>) {
  const choice = payload.choices?.[0];
  const delta = choice?.delta || {};
  return {
    content: delta.content || choice?.text || choice?.message?.content || payload.response || '',
    reasoning: delta.reasoning_content || delta.reasoning || delta.thought || '',
    finishReason: (choice?.finish_reason || payload.finish_reason) as string | undefined,
    usage: payload.usage,
  };
}

export async function sendChatMessageStream(
  provider: ProviderConfig,
  modelId: string,
  messages: ChatMessage[],
  parameters: ModelParameters,
  customSystemPrompt: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  contextWindow?: number,
  agentRules?: AgentRule[],
  agentSkills?: AgentSkill[],
  persona?: PersonaConfig,
  sessionPrompt?: string,
): Promise<void> {
  let content = '';
  let reasoning = '';
  let finishReason: string | undefined;
  let usage: { prompt?: number; completion?: number; total?: number } | undefined;

  const formatted = [
    { role: 'system', content: buildHarnessSystemPrompt(provider, modelId, customSystemPrompt, agentRules, agentSkills, persona, sessionPrompt) },
    ...messages.filter((message) => !message.isError && message.content.trim()).map((message) => ({ role: message.role, content: message.content })),
  ];

  const windowMax = contextWindow && contextWindow > 0 ? contextWindow : 64_000;
  const compaction = compactContext(formatted, windowMax, true);
  const contextMessages = compaction.messages;

  const MAX_AGENTIC_ITERATIONS = 8;
  let agenticIteration = 0;
  let finalContent = '';
  let finalReasoning = '';

  while (agenticIteration <= MAX_AGENTIC_ITERATIONS) {
    // Reset per-iteration accumulators
    content = '';
    reasoning = '';
    finishReason = undefined;

    const runRequest = async (useStream: boolean): Promise<boolean> => {
      let autoContinueCount = 0;
      const MAX_AUTO_CONTINUES = parameters.auto_continue !== false ? 3 : 0;
      let iterationContent = '';
      let iterationReasoning = '';

      while (true) {
        const payload: Record<string, unknown> = {
          model: modelId.trim(),
          messages: contextMessages,
          stream: useStream,
          temperature: parameters.temperature,
          top_p: parameters.top_p,
        };

        if (parameters.max_tokens && parameters.max_tokens > 0) {
          payload.max_tokens = parameters.max_tokens;
        }

        if (parameters.presence_penalty) payload.presence_penalty = parameters.presence_penalty;
        if (parameters.frequency_penalty) payload.frequency_penalty = parameters.frequency_penalty;

        if (provider.id === 'openrouter') {
          payload.include_reasoning = true;
          if (parameters.reasoning_effort && parameters.reasoning_effort !== 'auto') {
            payload.reasoning = { effort: parameters.reasoning_effort };
          }
        }

        const { response } = await fetchWithCORSFallback(
          endpoint(provider.baseUrl, 'chat/completions'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headersFor(provider, useStream) },
            body: JSON.stringify(payload),
            signal,
          },
          provider,
          provider.useProxy !== false
        );

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error?.message || body?.message || `Error HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!useStream || !contentType.includes('text/event-stream')) {
          const body = await response.json();
          const delta = extractDelta(body);
          iterationContent += delta.content;
          iterationReasoning += delta.reasoning;
          finishReason = delta.finishReason;
          usage = delta.usage && { prompt: delta.usage.prompt_tokens, completion: delta.usage.completion_tokens, total: delta.usage.total_tokens };
          if (delta.reasoning) { reasoning += delta.reasoning; callbacks.onReasoning?.(delta.reasoning); }
          if (delta.content) { content += delta.content; callbacks.onChunk(delta.content); }
          break;
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('El proveedor no entregó un flujo de respuesta.');
        const decoder = new TextDecoder();
        let buffer = '';

        const consumeLine = (line: string) => {
          const value = line.trim();
          if (!value.startsWith('data:')) return;
          const json = value.slice(5).trim();
          if (!json || json === '[DONE]') return;
          try {
            const delta = extractDelta(JSON.parse(json));
            if (delta.reasoning) { iterationReasoning += delta.reasoning; reasoning += delta.reasoning; callbacks.onReasoning?.(delta.reasoning); }
            if (delta.content) { iterationContent += delta.content; content += delta.content; callbacks.onChunk(delta.content); }
            if (delta.finishReason) finishReason = delta.finishReason;
            if (delta.usage) usage = { prompt: delta.usage.prompt_tokens, completion: delta.usage.completion_tokens, total: delta.usage.total_tokens };
          } catch {}
        };

        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          lines.forEach(consumeLine);
          if (done) break;
        }
        if (buffer) consumeLine(buffer);

        if (finishReason === 'length' && autoContinueCount < MAX_AUTO_CONTINUES && !signal?.aborted) {
          autoContinueCount++;
          const continuationPrompt = iterationContent.trim()
            ? `Continúa exactamente desde donde te quedaste sin repetir nada previo.`
            : `Has completado la fase de razonamiento. Ahora redacta la respuesta completa y detallada.`;
          formatted.push({ role: 'assistant', content: iterationContent || iterationReasoning });
          formatted.push({ role: 'user', content: continuationPrompt });
          const recompaction = compactContext(formatted, windowMax, true);
          contextMessages.splice(0, contextMessages.length, ...recompaction.messages);
          iterationContent = '';
          iterationReasoning = '';
          continue;
        }

        break;
      }
      return iterationContent.length > 0;
    };

    // Primary: streaming, fallback: non-streaming
    try {
      try {
        await runRequest(parameters.stream);
      } catch (primaryError) {
        if (parameters.stream && !signal?.aborted) {
          content = '';
          reasoning = '';
          finishReason = undefined;
          usage = undefined;
          await runRequest(false);
        } else {
          throw primaryError;
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        callbacks.onDone(finalContent || content, finalReasoning || reasoning, usage, 'stop');
        return;
      }
      callbacks.onError(corsHint(provider, error));
      return;
    }

    // --- Agentic Loop: detect tool calls and feed results back ---
    if (signal?.aborted || agenticIteration >= MAX_AGENTIC_ITERATIONS) break;

    if (hasToolBlocks(content)) {
      try {
        const { cleanText, toolResults } = await processToolBlocks(content);
        if (toolResults.length > 0) {
          // Append the assistant response with tool calls to conversation history
          formatted.push({ role: 'assistant', content });
          // Append tool results as a system/user message so the model can use them
          const toolResultText = toolResults
            .map((tr) => `[Resultado de ${tr.name}]:\n${tr.result}`)
            .join('\n\n');
          formatted.push({ role: 'user', content: `Aquí están los resultados de las herramientas que solicitaste:\n\n${toolResultText}\n\nAhora continúa con la tarea usando estos resultados. No vuelvas a llamar la misma herramienta con los mismos parámetros.` });

          // Update content to clean version for the final output
          content = cleanText;

          // Accumulate final content across iterations
          finalContent = (finalContent ? finalContent + '\n\n' : '') + cleanText;
          finalReasoning = (finalReasoning ? finalReasoning + '\n\n' : '') + reasoning;

          // Recompress context
          const recompaction = compactContext(formatted, windowMax, true);
          contextMessages.splice(0, contextMessages.length, ...recompaction.messages);

          agenticIteration++;
          // Reset for next iteration
          finishReason = undefined;
          continue;
        }
      } catch {
        // Tool processing failed, continue with clean content
      }
    }

    break; // No tool calls or max iterations reached
  }

  callbacks.onDone(finalContent || content, finalReasoning || reasoning, usage, finishReason || 'stop');
}

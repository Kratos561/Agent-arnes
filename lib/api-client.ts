import { ChatMessage, ModelInfo, ModelParameters, ProviderConfig } from './types';
import { compactContext } from './compaction';
import { ASK_PROTOCOL_INSTRUCTIONS } from './agent-protocol';
import { assemblePrompt, AgentRule, AgentSkill, PersonaConfig } from './agent-infra';

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

  // 2) Reintentos vía proxi
  for (const buildProxyUrl of CORS_PROXIES) {
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

  /**
   * Ejecuta la petición al proveedor completa (incluyendo auto-continuación).
   * @param useStream Si true usa streaming SSE; si false pide la respuesta completa.
   * @returns una promesa que resuelve al terminar (sin lanzar hacia el interior).
   */
  const runRequest = async (useStream: boolean): Promise<void> => {
    let autoContinueCount = 0;
    const MAX_AUTO_CONTINUES = parameters.auto_continue !== false ? 3 : 0;

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
        // Respuesta no-secuencial: esperamos un JSON único
        const body = await response.json();
        const delta = extractDelta(body);
        content += delta.content;
        reasoning += delta.reasoning;
        finishReason = delta.finishReason;
        usage = delta.usage && { prompt: delta.usage.prompt_tokens, completion: delta.usage.completion_tokens, total: delta.usage.total_tokens };
        if (delta.reasoning) callbacks.onReasoning?.(delta.reasoning);
        if (delta.content) callbacks.onChunk(delta.content);
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
          if (delta.reasoning) { reasoning += delta.reasoning; callbacks.onReasoning?.(delta.reasoning); }
          if (delta.content) { content += delta.content; callbacks.onChunk(delta.content); }
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
        const continuationPrompt = content.trim()
          ? `Continúa exactamente desde donde te quedaste sin repetir nada previo.`
          : `Has completado la fase de razonamiento. Ahora redacta la respuesta completa y detallada.`;
        formatted.push({ role: 'assistant', content: content || reasoning });
        formatted.push({ role: 'user', content: continuationPrompt });
        const recompaction = compactContext(formatted, windowMax, true);
        contextMessages.splice(0, contextMessages.length, ...recompaction.messages);
        continue;
      }

      break;
    }
  };

  try {
    // Intento principal: streaming (según preferencias del usuario)
    try {
      await runRequest(parameters.stream);
    } catch (primaryError) {
      // Si el streaming falló a través del proxy (común en proxies que no
      // soportan SSE), reintentamos en modo no-streaming con JSON.
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

    callbacks.onDone(content, reasoning, usage, finishReason || 'stop');
  } catch (error) {
    if (signal?.aborted) {
      callbacks.onDone(content, reasoning, usage, 'stop');
      return;
    }
    callbacks.onError(corsHint(provider, error));
  }
}

import { ChatMessage, ModelInfo, ModelParameters, ProviderConfig } from './types';
import { pruneMessagesForContext } from './context-manager';

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
  onDone: (content: string, reasoning: string, tokens?: { prompt?: number; completion?: number; total?: number }, finishReason?: string) => void;
  onError: (message: string) => void;
}

const localHostPattern = /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i;

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

function corsHint(provider: ProviderConfig, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  if (!localHostPattern.test(provider.baseUrl)) {
    return `${detail}. GitHub Pages no puede ocultar ni reenviar claves: el proveedor debe permitir CORS desde el navegador. Prueba OpenRouter, un endpoint compatible con CORS o ejecuta la app localmente.`;
  }
  return detail;
}

/** Consulta /models directamente desde el navegador; no depende de una ruta API propia. */
export async function fetchModels(provider: ProviderConfig): Promise<{ success: boolean; models: ModelInfo[]; error?: string }> {
  try {
    const response = await fetch(endpoint(provider.baseUrl, 'models'), { headers: headersFor(provider) });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { success: false, models: [], error: body?.error?.message || body?.message || `Error HTTP ${response.status}` };
    const entries = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
    return {
      success: true,
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

/** Prompt de ejecución visible y honesto: describe sólo capacidades del cliente estático. */
export function buildHarnessSystemPrompt(provider: ProviderConfig, modelId: string, customPrompt?: string) {
  const now = new Date().toLocaleString('es-ES');
  const harness = [
    '# CONTEXTO DEL HARNESS',
    `Estás en Agent Arnes, un cliente web estático. Fecha local: ${now}.`,
    `Proveedor: ${provider.name}. Modelo: ${modelId}.`,
    '',
    '## Interfaz',
    '- Usa Markdown, tablas, listas, bloques de código con lenguaje y LaTeX cuando aporte claridad.',
    '- Si muestras razonamiento, no reveles razonamiento privado detallado: da una explicación breve, verificable y orientada a decisiones.',
    '- Para tareas complejas, presenta un plan conciso, implementa y después indica cómo verificarlo.',
    '',
    '## Herramientas locales disponibles al usuario',
    '- El panel Herramientas puede validar/formatear JSON, codificar/decodificar Base64 y URL, calcular SHA-256, contar tokens aproximados y generar marcas de tiempo.',
    '- Puedes pedir al usuario que pegue el resultado de una herramienta. No afirmes haber ejecutado comandos, leído archivos del equipo, navegado la web o modificado un repositorio: esta versión estática no tiene acceso a esas capacidades.',
    '',
    '## Calidad',
    '- Responde en el idioma del usuario, declara supuestos y ofrece pasos de verificación concretos.',
  ].join('\n');
  return customPrompt?.trim() ? `${harness}\n\n# INSTRUCCIONES DEL USUARIO\n${customPrompt.trim()}` : harness;
}

function extractDelta(payload: Record<string, any>) {
  const choice = payload.choices?.[0];
  const delta = choice?.delta || {};
  return {
    content: delta.content || choice?.text || choice?.message?.content || payload.response || '',
    reasoning: delta.reasoning_content || delta.reasoning || delta.thought || '',
    finishReason: choice?.finish_reason as string | undefined,
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
): Promise<void> {
  let content = '';
  let reasoning = '';
  let finishReason: string | undefined;
  let usage: { prompt?: number; completion?: number; total?: number } | undefined;

  try {
    const formatted = [
      { role: 'system', content: buildHarnessSystemPrompt(provider, modelId, customSystemPrompt) },
      ...messages.filter((message) => !message.isError && message.content.trim()).map((message) => ({ role: message.role, content: message.content })),
    ];
    const payload: Record<string, unknown> = {
      model: modelId.trim(),
      messages: pruneMessagesForContext(formatted, 12_000),
      stream: parameters.stream,
      temperature: parameters.temperature,
      top_p: parameters.top_p,
      max_tokens: parameters.max_tokens,
    };
    if (parameters.presence_penalty) payload.presence_penalty = parameters.presence_penalty;
    if (parameters.frequency_penalty) payload.frequency_penalty = parameters.frequency_penalty;
    if (provider.id === 'openrouter') payload.include_reasoning = true;

    const response = await fetch(endpoint(provider.baseUrl, 'chat/completions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headersFor(provider, parameters.stream) },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error?.message || body?.message || `Error HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!parameters.stream || !contentType.includes('text/event-stream')) {
      const body = await response.json();
      const delta = extractDelta(body);
      content = delta.content;
      reasoning = delta.reasoning;
      finishReason = delta.finishReason;
      usage = delta.usage && { prompt: delta.usage.prompt_tokens, completion: delta.usage.completion_tokens, total: delta.usage.total_tokens };
      if (reasoning) callbacks.onReasoning?.(reasoning);
      if (content) callbacks.onChunk(content);
      callbacks.onDone(content, reasoning, usage, finishReason);
      return;
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
      const delta = extractDelta(JSON.parse(json));
      if (delta.reasoning) { reasoning += delta.reasoning; callbacks.onReasoning?.(delta.reasoning); }
      if (delta.content) { content += delta.content; callbacks.onChunk(delta.content); }
      if (delta.finishReason) finishReason = delta.finishReason;
      if (delta.usage) usage = { prompt: delta.usage.prompt_tokens, completion: delta.usage.completion_tokens, total: delta.usage.total_tokens };
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
    callbacks.onDone(content, reasoning, usage, finishReason || 'stop');
  } catch (error) {
    if (signal?.aborted) { callbacks.onDone(content, reasoning, usage, 'stop'); return; }
    callbacks.onError(corsHint(provider, error));
  }
}

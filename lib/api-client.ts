import { ChatMessage, ModelInfo, ModelParameters, ProviderConfig } from './types';
import { compactContext } from './compaction';
import { ASK_PROTOCOL_INSTRUCTIONS } from './agent-protocol';

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

/** Prompt de ejecución de alto rendimiento: otorga total libertad y capacidades completas al modelo. */
export function buildHarnessSystemPrompt(provider: ProviderConfig, modelId: string, customPrompt?: string) {
  const now = new Date().toLocaleString('es-ES');
  const harness = [
    '# ENTORNO DE EJECUCIÓN AGÉNTICO Y HARNESS',
    `Estás operando en Agent Arnes, un entorno de IA de alto rendimiento con renderizado reactivo y herramientas integradas. Fecha/Hora local: ${now}.`,
    `Proveedor activo: ${provider.name} | Modelo: ${modelId}.`,
    '',
    '## Capacidades y Libertad de Razonamiento:',
    '- **Razonamiento Profundo (Chain of Thought)**: Tienes total libertad para pensar, razonar paso a paso, planificar y descomponer problemas complejos con la máxima profundidad analítica. No te limites en tu proceso de pensamiento.',
    '- **Renderizado Enriquecido**: Utiliza Markdown estructurado, encabezados jerárquicos (##, ###), tablas formateadas, listas detalladas y notación matemática LaTeX ($...$ para inline y $$...$$ para display).',
    '- **Artefactos y Código Completo**: Genera código fuente completo, tipado, modular y listo para producción en bloques etiquetados (ej: ```typescript, ```python, ```sql, ```json, ```html, ```css, ```bash). Evita fragmentos incompletos o placeholders.',
    '- **Generación de Documentos y Reportes**: Cuando se te soliciten informes, reportes o datasets, redacta entregables completos con estructura profesional, tablas de métricas y conclusiones claras.',
    '',
    '## Suite de Herramientas del Entorno:',
    '- El entorno cuenta con una suite interactiva de herramientas de navegador que incluye ejecutor de código JavaScript/TypeScript en sandbox, motor relacional SQL, transformador de formatos (JSON/YAML/CSV/XML), comprobador de expresiones regulares, suite de criptografía y hashing, evaluador de fórmulas matemáticas y comparador de diffs.',
    '',
    '## Directrices de Calidad:',
    '- Proporciona soluciones directas, elegantes y exhaustivas adaptadas al idioma del usuario.',
    '- Asegura que las respuestas sean completas y no se corten prematuramente.',
    '',
    ASK_PROTOCOL_INSTRUCTIONS,
  ].join('\n');
  return customPrompt?.trim() ? `${harness}\n\n# INSTRUCCIONES PERSONALIZADAS DEL USUARIO:\n${customPrompt.trim()}` : harness;
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
): Promise<void> {
  let content = '';
  let reasoning = '';
  let finishReason: string | undefined;
  let usage: { prompt?: number; completion?: number; total?: number } | undefined;
  let autoContinueCount = 0;
  const MAX_AUTO_CONTINUES = parameters.auto_continue !== false ? 3 : 0;

  try {
    const formatted = [
      { role: 'system', content: buildHarnessSystemPrompt(provider, modelId, customSystemPrompt) },
      ...messages.filter((message) => !message.isError && message.content.trim()).map((message) => ({ role: message.role, content: message.content })),
    ];

    // Compactación de contexto: resume el historial antiguo cuando la ventana se llena
    const windowMax = contextWindow && contextWindow > 0 ? contextWindow : 64_000;
    const compaction = compactContext(formatted, windowMax, true);
    const contextMessages = compaction.messages;

    while (true) {
      const payload: Record<string, unknown> = {
        model: modelId.trim(),
        messages: contextMessages,
        stream: parameters.stream,
        temperature: parameters.temperature,
        top_p: parameters.top_p,
      };

      // Si max_tokens es 0 o no está definido, NO limitamos artificialmente al modelo
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

      // Si se agotaron los tokens antes de completar la respuesta, auto-continuar transparentemente
      if (finishReason === 'length' && autoContinueCount < MAX_AUTO_CONTINUES && !signal?.aborted) {
        autoContinueCount++;
        const continuationPrompt = content.trim()
          ? `Continúa exactamente desde donde te quedaste sin repetir nada previo.`
          : `Has completado la fase de razonamiento. Ahora redacta la respuesta completa y detallada.`;
        
        formatted.push({ role: 'assistant', content: content || reasoning });
        formatted.push({ role: 'user', content: continuationPrompt });
        // Re-calcular la compactación con el contexto ampliado para la continuación
        const recompaction = compactContext(formatted, windowMax, true);
        contextMessages.splice(0, contextMessages.length, ...recompaction.messages);
        continue;
      }

      break;
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

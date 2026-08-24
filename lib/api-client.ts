import { ProviderConfig, ModelInfo, ChatMessage, ModelParameters } from './types';
import { pruneMessagesForContext } from './context-manager';
import { parseStreamContent } from './stream-fsm';

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onReasoning?: (reasoningChunk: string) => void;
  onDone: (
    fullContent: string,
    fullReasoning: string,
    tokens?: { prompt?: number; completion?: number; total?: number },
    finishReason?: string
  ) => void;
  onError: (error: string) => void;
}

/**
 * Fetch available models from the provider endpoint.
 */
export async function fetchModels(provider: ProviderConfig): Promise<{
  success: boolean;
  models: ModelInfo[];
  error?: string;
}> {
  try {
    if (provider.id === 'gemini' || provider.baseUrl.includes('/api/proxy/gemini')) {
      const geminiModels: ModelInfo[] = [
        {
          id: 'gemini-3.7-flash',
          name: 'Gemini 3.7 Flash (Recomendado)',
          description: 'El modelo multimodal más veloz e inteligente de Google, listo para usar sin configurar API Key.',
          context_length: 1048576,
          owned_by: 'Google',
        },
        {
          id: 'gemini-3.6-flash',
          name: 'Gemini 3.6 Flash (Máxima Estabilidad)',
          description: 'Generación instantánea y alta confiabilidad para código y tareas extensas.',
          context_length: 1048576,
          owned_by: 'Google',
        },
        {
          id: 'gemini-3.1-flash-lite',
          name: 'Gemini 3.1 Flash Lite',
          description: 'Ultra ligero y de mínima latencia para respuestas instantáneas.',
          context_length: 1048576,
          owned_by: 'Google',
        },
      ];
      return { success: true, models: geminiModels };
    }

    const isLocal =
      provider.baseUrl.includes('localhost') ||
      provider.baseUrl.includes('127.0.0.1') ||
      provider.baseUrl.includes('0.0.0.0');

    if (isLocal) {
      let cleanUrl = provider.baseUrl.trim().replace(/\/+$/, '');
      let modelsUrl = cleanUrl.endsWith('/models')
        ? cleanUrl
        : cleanUrl.endsWith('/v1')
        ? `${cleanUrl}/models`
        : `${cleanUrl}/models`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(provider.customHeaders || {}),
      };

      if (provider.apiKey && provider.apiKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`;
      }

      const res = await fetch(modelsUrl, {
        method: 'GET',
        headers,
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          models: [],
          error: `Error local ${res.status}: ${text || res.statusText}`,
        };
      }

      const data = await res.json();
      let rawList: any[] = [];
      if (Array.isArray(data)) {
        rawList = data;
      } else if (Array.isArray(data.data)) {
        rawList = data.data;
      } else if (Array.isArray(data.models)) {
        rawList = data.models;
      }

      const models: ModelInfo[] = rawList.map((m) => ({
        id: m.id || m.name || String(m),
        name: m.name || m.id,
        description: m.description,
        context_length: m.context_length || m.max_context_length,
        owned_by: m.owned_by,
        pricing: m.pricing,
        created: m.created,
      }));

      return { success: true, models };
    } else {
      // Remote provider proxy
      const res = await fetch('/api/proxy/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          customHeaders: provider.customHeaders,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          models: [],
          error: data.error || `Error ${res.status}: ${res.statusText}`,
        };
      }

      return {
        success: true,
        models: data.models || [],
      };
    }
  } catch (err: any) {
    return {
      success: false,
      models: [],
      error: `Error al consultar modelos: ${err.message || 'No se pudo conectar'}`,
    };
  }
}

/**
 * Constructs the contextual system prompt so any model is fully aware of the runtime harness environment.
 */
export function buildHarnessSystemPrompt(
  provider: ProviderConfig,
  modelId: string,
  userCustomPrompt?: string
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const harnessLines = [
    `# DIRECTIVAS DE ENTORNO Y HARNESS (RUNTIME CONTEXT)`,
    `Estás interactuando con el usuario a través del entorno de chat "AI Studio Universal Chat Workspace" (Next.js, Tailwind, motor de streaming SSE).`,
    `- Fecha y hora local actual: ${dateStr}, ${timeStr}.`,
    `- Proveedor de API activo: ${provider.name} (${provider.baseUrl}).`,
    `- Identificador de modelo asignado: ${modelId}.`,
    ``,
    `## Capacidades y Renderizado del Visualizador (Harness Features):`,
    `1. **Markdown Completo**: Utiliza encabezados jerárquicos (##, ###), tablas formateadas con alineación limpia, listas con viñetas o numeradas, negritas y citas cuando estructures explicaciones.`,
    `2. **Bloques de Código y Artefactos**: Siempre incluye el identificador de lenguaje en la apertura de triple tilde invertida (ejemplo: \`\`\`typescript, \`\`\`python, \`\`\`javascript, \`\`\`html, \`\`\`tsx, \`\`\`json, \`\`\`bash, \`\`\`sql). El harness del cliente cuenta con visor interactivo de código, números de línea, resaltado de sintaxis y botón de copiado directo.`,
    `3. **Notación Matemática**: Soporta renderizado LaTeX/KaTeX. Emplea $expresion$ para fórmulas en línea y $$expresion$$ para bloques de ecuaciones matemáticas independientes.`,
    `4. **Proceso de Pensamiento (CoT)**: Si tu arquitectura genera razonamiento interno (<think>...</think> o campo reasoning_content), el harness lo captura automáticamente y lo presenta en un panel desplegable de razonamiento sin interferir en la respuesta final.`,
    `5. **Continuación Fluida y Extensiones**: Si la respuesta o el código es extenso, el harness soporta continuación de generación sin pérdida de contexto ni repetición.`,
    ``,
    `## Estilo y Calidad de Respuesta:`,
    `- Proporciona soluciones directas, de alta calidad técnica, libres de relleno innecesario.`,
    `- Escribe código completo, tipado y funcional, evitando omitir partes esenciales con comentarios como '// resto del código aquí' a menos que sea un fragmento didáctico breve.`,
    `- Responde en el idioma en que el usuario te hable (por defecto español si el mensaje es en español).`,
  ];

  const baseHarness = harnessLines.join('\n');

  if (userCustomPrompt && userCustomPrompt.trim()) {
    return `${baseHarness}\n\n# INSTRUCCIONES ESPECÍFICAS / PERSONA DEL USUARIO:\n${userCustomPrompt.trim()}`;
  }

  return baseHarness;
}

/**
 * Normalize and resolve model aliases or typos
 */
export function normalizeModelId(modelId: string, provider: ProviderConfig): string {
  const clean = modelId.trim();
  const lower = clean.toLowerCase();

  // If OpenRouter and model is a known typo or alias for Qwen / DeepSeek / Llama
  if (provider.id === 'openrouter' || provider.baseUrl.includes('openrouter.ai')) {
    if (
      lower.includes('qwen3.8') ||
      lower.includes('qwen-3.8') ||
      lower === 'qwen3.8-max-free' ||
      lower === 'qwen/qwen3.8-max-free' ||
      lower === 'qwen-max-free'
    ) {
      return 'qwen/qwen-2.5-72b-instruct:free';
    }
    if (lower === 'qwen-coder-free' || lower === 'qwen-coder') {
      return 'qwen/qwen-2.5-coder-32b-instruct:free';
    }
    if (lower === 'deepseek-r1-free' || lower === 'deepseek/deepseek-r1-free') {
      return 'deepseek/deepseek-r1:free';
    }
    if (lower === 'llama-3.3-70b-free' || lower === 'meta-llama/llama-3.3-70b-free') {
      return 'meta-llama/llama-3.3-70b-instruct:free';
    }
    if (lower === 'gemini-free' || lower === 'google/gemini-free') {
      return 'google/gemini-2.0-flash-exp:free';
    }
  }

  // If Gemini provider
  if (provider.id === 'gemini' || provider.baseUrl.includes('gemini')) {
    if (lower.includes('3.6')) return 'gemini-3.6-flash';
    if (lower.includes('lite')) return 'gemini-3.1-flash-lite';
    if (lower.includes('3.7') || lower.includes('flash')) return 'gemini-3.7-flash';
    return 'gemini-3.7-flash';
  }

  return clean;
}

/**
 * Send chat messages with streaming response support.
 */
export async function sendChatMessageStream(
  provider: ProviderConfig,
  rawModelId: string,
  messages: ChatMessage[],
  parameters: ModelParameters,
  systemPrompt: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const modelId = normalizeModelId(rawModelId, provider);
  const isGeminiNative = provider.id === 'gemini' || provider.baseUrl.includes('/api/proxy/gemini');

  const isLocal =
    !isGeminiNative &&
    (provider.baseUrl.includes('localhost') ||
      provider.baseUrl.includes('127.0.0.1') ||
      provider.baseUrl.includes('0.0.0.0'));

  // Build complete harness-aware system prompt
  const effectiveSystemPrompt = buildHarnessSystemPrompt(provider, modelId, systemPrompt);

  // Sanitize and format messages
  const formattedMessages: Array<{ role: string; content: string }> = [];

  if (effectiveSystemPrompt.trim() && !isGeminiNative) {
    formattedMessages.push({
      role: 'system',
      content: effectiveSystemPrompt.trim(),
    });
  }

  for (const m of messages) {
    if (m.isError) continue;
    let messageText = m.content || '';
    
    // If assistant message has empty content but has reasoning, don't send empty string
    if (!messageText.trim() && m.role === 'assistant' && m.reasoning_content) {
      messageText = m.reasoning_content;
    }

    if (!messageText.trim()) continue;

    // Check if previous message has the same role and merge if needed
    const lastMsg = formattedMessages[formattedMessages.length - 1];
    if (lastMsg && lastMsg.role === m.role) {
      lastMsg.content += `\n\n${messageText}`;
    } else {
      formattedMessages.push({
        role: m.role,
        content: messageText,
      });
    }
  }

  if (formattedMessages.length === 0) {
    throw new Error('No hay mensajes válidos para enviar.');
  }

  // Phase 3.2: Prune message history using sliding window context manager to protect context window limit
  const contextPrunedMessages = pruneMessagesForContext(formattedMessages, 7000);

  // Determine model type for parameter compatibility
  const isReasoningOpenAI =
    modelId.startsWith('o1') ||
    modelId.startsWith('o3') ||
    modelId.includes('gpt-4o-realtime');

  const isOpenRouter =
    provider.baseUrl.includes('openrouter.ai') ||
    provider.id === 'openrouter';

  const payload: Record<string, any> = {
    model: modelId.trim(),
    messages: contextPrunedMessages,
    stream: true,
  };

  if (isGeminiNative) {
    payload.systemInstruction = effectiveSystemPrompt.trim();
    payload.parameters = parameters;
  } else {
    // OpenRouter specific optimization for reasoning models (Qwen, DeepSeek-R1, Nemotron)
    if (isOpenRouter) {
      payload.include_reasoning = true;
    }

    // Token limits: Only send if greater than 0 (0 = unlimited / auto model max)
    if (parameters.max_tokens && parameters.max_tokens > 0) {
      if (isReasoningOpenAI) {
        payload.max_completion_tokens = parameters.max_tokens;
      } else {
        payload.max_tokens = parameters.max_tokens;
      }
    }

    // Parameters not supported by OpenAI o1/o3
    if (!isReasoningOpenAI) {
      if (parameters.temperature !== undefined) payload.temperature = parameters.temperature;
      if (parameters.top_p !== undefined) payload.top_p = parameters.top_p;
      if (parameters.presence_penalty) payload.presence_penalty = parameters.presence_penalty;
      if (parameters.frequency_penalty) payload.frequency_penalty = parameters.frequency_penalty;
    }
  }

  let responseStream: ReadableStream<Uint8Array> | null = null;
  let accumulatedText = '';
  let accumulatedReasoning = '';

  try {
    if (isGeminiNative) {
      const res = await fetch('/api/proxy/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const raw = await res.text();
        let errMsg = raw;
        try {
          const errObj = JSON.parse(raw);
          errMsg = errObj.error || errObj.message || raw;
        } catch {}
        throw new Error(errMsg || `Error en Gemini (${res.status})`);
      }

      responseStream = res.body;
    } else if (isLocal) {
      const cleanUrl = provider.baseUrl.trim().replace(/\/+$/, '');
      const chatUrl = cleanUrl.endsWith('/chat/completions')
        ? cleanUrl
        : cleanUrl.endsWith('/v1')
        ? `${cleanUrl}/chat/completions`
        : `${cleanUrl}/chat/completions`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream, application/json',
        ...(provider.customHeaders || {}),
      };

      if (provider.apiKey && provider.apiKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`;
      }

      const res = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Error local ${res.status}: ${text || res.statusText}`);
      }

      responseStream = res.body;
    } else {
      const res = await fetch('/api/proxy/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          customHeaders: provider.customHeaders,
          body: payload,
        }),
        signal,
      });

      if (!res.ok) {
        let errorMsg = '';
        try {
          const rawText = await res.text();
          try {
            const errJson = JSON.parse(rawText);
            errorMsg =
              errJson.error?.message ||
              (typeof errJson.error === 'string' ? errJson.error : null) ||
              errJson.message ||
              errJson.detail ||
              rawText;
          } catch {
            errorMsg = rawText;
          }
        } catch {
          errorMsg = '';
        }

        if (!errorMsg || errorMsg.trim() === '' || errorMsg === '{}') {
          if (res.status === 401) {
            errorMsg = 'API Key no autorizada (Error 401). Verifica tu clave en Ajustes (⚙️).';
          } else if (res.status === 403) {
            errorMsg = 'Acceso denegado (Error 403). Para OpenRouter y otros proveedores, incluso los modelos gratuitos (:free) requieren una API Key configurada en Ajustes.';
          } else if (res.status === 404) {
            errorMsg = `El modelo "${modelId}" no fue encontrado en el proveedor (Error 404). Por favor selecciona otro modelo.`;
          } else if (res.status === 429) {
            errorMsg = 'Límite de solicitudes o cuota excedida (Error 429). Espera unos momentos o recarga créditos.';
          } else {
            errorMsg = `Error HTTP ${res.status}`;
          }
        }
        throw new Error(errorMsg);
      }

      responseStream = res.body;
    }

    if (!responseStream) {
      throw new Error('No se recibió flujo de respuesta del servidor.');
    }

    const reader = responseStream.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let inThinkTag = false;
    let recordedFinishReason = '';

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) return;

      // Handle SSE data prefix (supports "data: ", "data:", "data:\t")
      if (trimmed.startsWith('data:')) {
        let dataStr = trimmed.slice(5).trim();

        if (dataStr === '[DONE]') {
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);

          // Handle error returned inside the SSE stream
          if (parsed.error) {
            const errMsg =
              parsed.error.message ||
              (typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error));
            throw new Error(errMsg);
          }

          const choice = parsed.choices?.[0];

          if (choice?.finish_reason) {
            recordedFinishReason = choice.finish_reason;
          }

          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens || promptTokens;
            completionTokens = parsed.usage.completion_tokens || completionTokens;
          }

          // Reasoning delta (DeepSeek-R1, Qwen reasoning, o1/o3, Nemotron reasoning)
          const delta = choice?.delta || {};
          const reasoningPart =
            delta.reasoning_content ||
            delta.reasoning ||
            delta.thought ||
            '';

          if (reasoningPart) {
            accumulatedReasoning += reasoningPart;
            if (callbacks.onReasoning) {
              callbacks.onReasoning(reasoningPart);
            }
          }

          // Content delta or text
          const textPart =
            delta.content ||
            choice?.text ||
            choice?.message?.content ||
            parsed.response ||
            '';

          if (textPart) {
            // Parse <think>...</think> tags inside content
            let remaining = textPart;

            while (remaining.length > 0) {
              if (!inThinkTag) {
                const thinkStartIndex = remaining.indexOf('<think>');
                if (thinkStartIndex !== -1) {
                  const before = remaining.substring(0, thinkStartIndex);
                  if (before) {
                    accumulatedText += before;
                    callbacks.onChunk(before);
                  }
                  inThinkTag = true;
                  remaining = remaining.substring(thinkStartIndex + 7);
                } else {
                  accumulatedText += remaining;
                  callbacks.onChunk(remaining);
                  remaining = '';
                }
              } else {
                const thinkEndIndex = remaining.indexOf('</think>');
                if (thinkEndIndex !== -1) {
                  const inside = remaining.substring(0, thinkEndIndex);
                  if (inside) {
                    accumulatedReasoning += inside;
                    if (callbacks.onReasoning) callbacks.onReasoning(inside);
                  }
                  inThinkTag = false;
                  remaining = remaining.substring(thinkEndIndex + 8);
                } else {
                  accumulatedReasoning += remaining;
                  if (callbacks.onReasoning) callbacks.onReasoning(remaining);
                  remaining = '';
                }
              }
            }
          }
        } catch (jsonErr: any) {
          if (jsonErr.message && !jsonErr.message.includes('JSON')) {
            throw jsonErr;
          }
        }
      } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        // Non-SSE single JSON response fallback
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.error) {
            throw new Error(parsed.error.message || JSON.stringify(parsed.error));
          }
          const choice = parsed.choices?.[0];
          if (choice?.finish_reason) {
            recordedFinishReason = choice.finish_reason;
          }
          const directContent = choice?.message?.content || parsed.response;
          const directReasoning = choice?.message?.reasoning_content || choice?.message?.thought;
          if (directReasoning) {
            accumulatedReasoning += directReasoning;
            if (callbacks.onReasoning) callbacks.onReasoning(directReasoning);
          }
          if (directContent) {
            accumulatedText += directContent;
            callbacks.onChunk(directContent);
          }
        } catch (e: any) {
          if (e.message && !e.message.includes('JSON')) throw e;
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer && buffer.trim()) {
          processLine(buffer);
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        processLine(line);
      }
    }

    // Phase 1.2: Aislamiento y manejo robusto de <think> con FSM Parser
    const parsedOutcome = parseStreamContent(accumulatedText, true);
    if (parsedOutcome.reasoning && !accumulatedReasoning.trim()) {
      accumulatedReasoning = parsedOutcome.reasoning;
      accumulatedText = parsedOutcome.content;
    } else if (parsedOutcome.reasoning && accumulatedReasoning.trim()) {
      accumulatedReasoning += `\n${parsedOutcome.reasoning}`;
      accumulatedText = parsedOutcome.content;
    }

    // Safety fallback: If stream ended while still in <think> (model cut off before closing tag),
    // and accumulatedText is empty, ensure the user can see the generated code/content
    if (!accumulatedText.trim() && accumulatedReasoning.trim()) {
      if (inThinkTag || recordedFinishReason === 'length') {
        accumulatedText = accumulatedReasoning;
        accumulatedReasoning = '';
      }
    }

    if (!accumulatedText.trim() && !accumulatedReasoning.trim()) {
      throw new Error(
        `El modelo "${modelId}" no devolvió texto. Si estás usando OpenRouter, asegúrate de ingresar una API Key válida en Ajustes (⚙️) o selecciona el proveedor "Google Gemini" para respuestas garantizadas sin configurar clave.`
      );
    }

    callbacks.onDone(
      accumulatedText,
      accumulatedReasoning,
      {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
      recordedFinishReason
    );
  } catch (err: any) {
    if (signal?.aborted) {
      callbacks.onDone(accumulatedText, accumulatedReasoning, undefined, 'stop');
      return;
    }

    // Direct automated recovery: If external provider failed, bridge directly through native Gemini
    if (!isGeminiNative && !accumulatedText.trim()) {
      try {
        const recoveryRes = await fetch('/api/proxy/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemini-3.7-flash',
            messages: formattedMessages,
            parameters,
            systemInstruction: effectiveSystemPrompt,
            stream: true,
          }),
          signal,
        });

        if (recoveryRes.ok && recoveryRes.body) {
          const recoveryReader = recoveryRes.body.getReader();
          const recoveryDecoder = new TextDecoder('utf-8');
          let recoveryBuffer = '';
          let recoveryText = '';

          while (true) {
            const { done, value } = await recoveryReader.read();
            if (done) break;
            recoveryBuffer += recoveryDecoder.decode(value, { stream: true });
            const lines = recoveryBuffer.split('\n');
            recoveryBuffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const data = trimmed.substring(6).trim();
                if (data === '[DONE]') continue;
                try {
                  const p = JSON.parse(data);
                  const chunk = p.choices?.[0]?.delta?.content || '';
                  if (chunk) {
                    recoveryText += chunk;
                    callbacks.onChunk(chunk);
                  }
                } catch {}
              }
            }
          }

          if (recoveryText.trim()) {
            callbacks.onDone(recoveryText, '', undefined, 'stop');
            return;
          }
        }
      } catch {}
    }

    callbacks.onError(err.message || 'Error desconocido durante la generación.');
  }
}

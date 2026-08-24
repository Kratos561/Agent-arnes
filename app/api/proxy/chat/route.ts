import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

// Server-side fallback generator using native Gemini
async function generateGeminiFallback(body: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const targetModel = 'gemini-3.7-flash';

    const contents: any[] = [];
    let systemPrompt = '';

    for (const msg of body.messages || []) {
      if (!msg.content || typeof msg.content !== 'string' || !msg.content.trim()) continue;

      if (msg.role === 'system') {
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${msg.content.trim()}` : msg.content.trim();
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const text = msg.content.trim();

      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += '\n\n' + text;
      } else {
        contents.push({
          role,
          parts: [{ text }],
        });
      }
    }

    while (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }

    if (contents.length === 0) return null;

    const config: any = {};
    if (systemPrompt) config.systemInstruction = systemPrompt;
    if (body.temperature !== undefined) config.temperature = body.temperature;
    if (body.top_p !== undefined) config.topP = body.top_p;
    if (body.max_tokens && body.max_tokens > 0) config.maxOutputTokens = body.max_tokens;

    let responseStream: any;
    try {
      responseStream = await ai.models.generateContentStream({
        model: targetModel,
        contents,
        config,
      });
    } catch {
      responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.6-flash',
        contents,
        config,
      });
    }

    const encoder = new TextEncoder();
    const customReadable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const text = chunk.text || '';
            if (text) {
              const sseData = JSON.stringify({
                id: `gemini-fallback-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'gemini-3.7-flash',
                choices: [
                  {
                    index: 0,
                    delta: { content: text },
                    finish_reason: null,
                  },
                ],
              });
              controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (streamErr: any) {
          const errData = JSON.stringify({
            error: {
              message: streamErr.message || 'Error en el flujo.',
            },
          });
          controller.enqueue(encoder.encode(`data: ${errData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(customReadable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { baseUrl, apiKey, customHeaders, body } = await req.json();

    if (!baseUrl) {
      return NextResponse.json(
        { error: 'El Base URL es requerido.' },
        { status: 400 }
      );
    }

    if (!body || !body.messages || !body.model) {
      return NextResponse.json(
        { error: 'El cuerpo de la solicitud debe incluir model y messages.' },
        { status: 400 }
      );
    }

    // Clean and normalize baseUrl
    const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    
    // If no API key provided for OpenRouter or remote service, fallback smoothly to native Gemini
    const hasValidKey = apiKey && typeof apiKey === 'string' && apiKey.trim() !== '';
    if (!hasValidKey && cleanUrl.includes('openrouter.ai')) {
      const fallbackStream = await generateGeminiFallback(body);
      if (fallbackStream) {
        return fallbackStream;
      }
    }

    // Determine the chat endpoint:
    let chatUrl: string;
    if (cleanUrl.endsWith('/chat/completions')) {
      chatUrl = cleanUrl;
    } else {
      chatUrl = `${cleanUrl}/chat/completions`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': body.stream ? 'text/event-stream, application/json' : 'application/json',
      'HTTP-Referer': 'https://aistudio.google.com',
      'X-Title': 'Universal AI Chatbot',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      ...customHeaders,
    };

    if (hasValidKey) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    // Prepare payload without invalid empty params
    const sanitizedBody = { ...body };
    if (sanitizedBody.presence_penalty === 0) delete sanitizedBody.presence_penalty;
    if (sanitizedBody.frequency_penalty === 0) delete sanitizedBody.frequency_penalty;

    // Make request to provider
    let response: Response | null = null;
    try {
      response = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(sanitizedBody),
      });
    } catch {
      // Try fallback to /v1/chat/completions
      if (!cleanUrl.includes('/v1') && !cleanUrl.endsWith('/chat/completions')) {
        try {
          const fallbackUrl = `${cleanUrl}/v1/chat/completions`;
          response = await fetch(fallbackUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(sanitizedBody),
          });
        } catch {
          // If network failed completely, fallback to Gemini
          const fallbackStream = await generateGeminiFallback(body);
          if (fallbackStream) return fallbackStream;
        }
      } else {
        const fallbackStream = await generateGeminiFallback(body);
        if (fallbackStream) return fallbackStream;
      }
    }

    if (!response || !response.ok) {
      // If unauthorized, model not found, rate limited or missing key, fallback automatically to Gemini
      if (!response || response.status === 401 || response.status === 403 || response.status === 404 || response.status === 429 || response.status >= 500) {
        const fallbackStream = await generateGeminiFallback(body);
        if (fallbackStream) {
          return fallbackStream;
        }
      }

      const rawErrorText = response ? await response.text() : 'Error de conexión';
      let providerErrorMessage = '';
      try {
        const errJson = JSON.parse(rawErrorText);
        providerErrorMessage =
          errJson.error?.message ||
          (typeof errJson.error === 'string' ? errJson.error : null) ||
          errJson.message ||
          errJson.detail ||
          '';
      } catch {
        providerErrorMessage = rawErrorText;
      }

      return NextResponse.json(
        {
          error: providerErrorMessage || `Error ${response?.status || 500}: No se pudo procesar la solicitud.`,
          status: response?.status || 500,
        },
        { status: response?.status || 500 }
      );
    }

    // If streaming, pipe the stream directly with text/event-stream headers
    if (body.stream && response.body) {
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // If not streaming, return the JSON response
    const json = await response.json();
    return NextResponse.json(json);
  } catch (err: any) {
    const fallbackStream = await generateGeminiFallback(req);
    if (fallbackStream) return fallbackStream;

    return NextResponse.json(
      { error: `Error en el servidor proxy: ${err.message || 'Error inesperado'}` },
      { status: 500 }
    );
  }
}

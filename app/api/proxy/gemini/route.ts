import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { model, messages, parameters, systemInstruction, stream } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY no está configurada en las variables de entorno.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Map model alias to supported Gemini models
    let targetModel = 'gemini-3.7-flash';
    const cleanModel = (model || '').toLowerCase();

    if (cleanModel.includes('3.1-flash-lite') || cleanModel.includes('lite')) {
      targetModel = 'gemini-3.1-flash-lite';
    } else if (cleanModel.includes('3.6-flash')) {
      targetModel = 'gemini-3.6-flash';
    } else if (cleanModel.includes('3.7-flash') || cleanModel.includes('flash') || cleanModel.includes('gemini')) {
      targetModel = 'gemini-3.7-flash';
    }

    const config: any = {};
    if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()) {
      config.systemInstruction = systemInstruction.trim();
    }
    if (parameters?.temperature !== undefined) {
      config.temperature = parameters.temperature;
    }
    if (parameters?.top_p !== undefined) {
      config.topP = parameters.top_p;
    }
    if (parameters?.max_tokens && parameters.max_tokens > 0) {
      config.maxOutputTokens = parameters.max_tokens;
    }

    // Convert messages array into Gemini contents structure with alternating roles
    const contents: any[] = [];
    for (const msg of messages || []) {
      if (!msg.content || typeof msg.content !== 'string' || !msg.content.trim()) continue;

      if (msg.role === 'system') {
        if (!config.systemInstruction) {
          config.systemInstruction = msg.content.trim();
        } else {
          config.systemInstruction += '\n\n' + msg.content.trim();
        }
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

    // Ensure first message is user
    while (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }

    if (contents.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron mensajes válidos para enviar a Gemini.' },
        { status: 400 }
      );
    }

    // Helper to get response stream with fallback to 3.6-flash if 3.7 encounters temporary issue
    let responseStream: any = null;
    try {
      responseStream = await ai.models.generateContentStream({
        model: targetModel,
        contents,
        config,
      });
    } catch (primaryErr: any) {
      // Fallback model
      targetModel = 'gemini-3.6-flash';
      responseStream = await ai.models.generateContentStream({
        model: targetModel,
        contents,
        config,
      });
    }

    if (stream !== false) {
      const encoder = new TextEncoder();

      const customReadable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of responseStream) {
              const text = chunk.text || '';
              if (text) {
                const sseData = JSON.stringify({
                  id: `gemini-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: targetModel,
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
                message: streamErr.message || 'Error en el flujo de Gemini.',
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
    } else {
      const response = await ai.models.generateContent({
        model: targetModel,
        contents,
        config,
      });

      return NextResponse.json({
        id: `gemini-${Date.now()}`,
        choices: [
          {
            message: {
              role: 'assistant',
              content: response.text || '',
            },
            finish_reason: 'stop',
          },
        ],
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `Error en Gemini API: ${err.message || 'Error interno'}` },
      { status: 500 }
    );
  }
}

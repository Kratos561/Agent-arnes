import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateAgentAuth } from '@/lib/agent-auth';
import { PLATFORM_TOOLS, executeToolCall } from '@/lib/agent-tools';

export async function POST(req: NextRequest) {
  try {
    const auth = validateAgentAuth(req);
    // Allow chat sessions or registered agent credentials
    const agent = auth.agent || {
      agent_id: 'agent_chat_user',
      client_id: 'chat_interface',
      name: 'Chat User Agent',
      description: 'Chat User Agent Interface',
      role: 'SUPER_ADMIN_AGENT' as const,
      scopes: ['*'],
      status: 'active' as const,
      token_hash: '',
      token_preview: '',
      created_at: Date.now(),
      confirmation_mode: 'AUTO_APPROVE' as const,
    };

    const { messages, model, systemInstruction, parameters, dry_run } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY no configurada en el servidor' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const targetModel = model || 'gemini-3.7-flash';

    const encoder = new TextEncoder();
    const customReadable = new ReadableStream({
      async start(controller) {
        function sendEvent(type: string, data: any) {
          const payload = JSON.stringify({ type, ...data });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        }

        try {
          const MAX_TURNS = 15;
          let turn = 0;
          const conversationHistory: any[] = [...(messages || [])];

          // System tools definitions for Gemini Function Calling
          const geminiFunctionDeclarations = PLATFORM_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: {
              type: 'OBJECT',
              properties: t.parameters.properties,
              required: t.parameters.required || [],
            },
          }));

          while (turn < MAX_TURNS) {
            turn++;

            // Prepare Gemini contents
            const contents: any[] = [];
            let sysInstruction = systemInstruction || 'Eres un Agente de IA con acceso administrativo completo a la plataforma. Utiliza las herramientas disponibles para analizar, modificar código, consultar la base de datos o realizar tareas solicitadas.';

            for (const msg of conversationHistory) {
              if (msg.role === 'system') {
                sysInstruction += `\n\n${msg.content}`;
                continue;
              }

              if (msg.role === 'tool') {
                contents.push({
                  role: 'user',
                  parts: [
                    {
                      functionResponse: {
                        name: msg.name || 'tool_response',
                        response: { result: msg.content },
                      },
                    },
                  ],
                });
                continue;
              }

              const role = msg.role === 'assistant' ? 'model' : 'user';
              if (msg.functionCalls) {
                contents.push({
                  role: 'model',
                  parts: msg.functionCalls.map((fc: any) => ({
                    functionCall: { name: fc.name, args: fc.args },
                  })),
                });
              } else if (msg.content) {
                contents.push({
                  role,
                  parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
                });
              }
            }

            // Call Gemini with tools
            const response = await ai.models.generateContent({
              model: targetModel,
              contents,
              config: {
                systemInstruction: sysInstruction,
                temperature: parameters?.temperature ?? 0.2,
                tools: [{ functionDeclarations: geminiFunctionDeclarations as any }],
              },
            });

            const candidate = response.candidates?.[0];
            const parts = candidate?.content?.parts || [];
            
            let textOutput = '';
            const functionCalls: any[] = [];

            for (const part of parts) {
              if (part.text) textOutput += part.text;
              if (part.functionCall) {
                functionCalls.push(part.functionCall);
              }
            }

            // Stream text chunk to client
            if (textOutput) {
              sendEvent('content', { text: textOutput });
            }

            // If no function calls, agent loop finished
            if (functionCalls.length === 0) {
              sendEvent('done', { turns: turn });
              break;
            }

            // Record assistant tool calls in conversation
            conversationHistory.push({
              role: 'assistant',
              functionCalls,
              content: textOutput || undefined,
            });

            // Execute tool calls
            for (const fc of functionCalls) {
              const callId = `call_${crypto.randomBytes(4).toString('hex')}`;
              sendEvent('tool_call', {
                call_id: callId,
                name: fc.name,
                args: fc.args,
              });

              const toolResult = await executeToolCall(fc.name, fc.args || {}, {
                agent,
                request_id: callId,
                dry_run: Boolean(dry_run),
              });

              sendEvent('tool_result', {
                call_id: callId,
                name: fc.name,
                success: toolResult.success,
                message: toolResult.message,
                data: toolResult.data,
                diff: toolResult.diff,
                pending_confirmation_id: toolResult.pending_confirmation_id,
              });

              conversationHistory.push({
                role: 'tool',
                name: fc.name,
                tool_call_id: callId,
                content: toolResult.data || toolResult.message || toolResult.error || 'Operación completada',
              });
            }
          }

          controller.close();
        } catch (loopErr: any) {
          sendEvent('error', { message: loopErr.message || 'Error en el loop agéntico' });
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

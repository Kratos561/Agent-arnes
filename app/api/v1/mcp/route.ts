import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateAgentAuth } from '@/lib/agent-auth';
import { PLATFORM_TOOLS, executeToolCall } from '@/lib/agent-tools';
import { getDatabase } from '@/lib/agent-db';

const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {
  name: 'universal-ai-agent-platform',
  version: '1.0.0',
  description: 'Full Platform AI Agent Hub with SUPER_ADMIN_AGENT and FULL_PLATFORM_ACCESS capabilities',
};

// GET: SSE Stream transport for MCP Clients
export async function GET(req: NextRequest) {
  const auth = validateAgentAuth(req);
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado para conectar a MCP' }, { status: auth.statusCode || 401 });
  }

  const encoder = new TextEncoder();
  const sessionId = `mcp_sess_${crypto.randomBytes(8).toString('hex')}`;

  const customReadable = new ReadableStream({
    start(controller) {
      // Send endpoint event with session URI according to MCP SSE specification
      const endpointEvent = `event: endpoint\ndata: /api/v1/mcp?sessionId=${sessionId}\n\n`;
      controller.enqueue(encoder.encode(endpointEvent));

      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(pingInterval);
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
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
}

// POST: JSON-RPC 2.0 Handler
export async function POST(req: NextRequest) {
  const auth = validateAgentAuth(req);
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32001,
          message: auth.error || 'Autenticación requerida para MCP.',
        },
      },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    const body = await req.json();
    const { jsonrpc, id, method, params } = body;

    if (jsonrpc !== '2.0') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id: id || null,
        error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
      });
    }

    const requestId = req.headers.get('x-request-id') || `mcp_req_${crypto.randomBytes(6).toString('hex')}`;

    switch (method) {
      // 1. MCP Initialization
      case 'initialize': {
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false },
              logging: {},
            },
            serverInfo: SERVER_INFO,
            instructions: `Eres un agente de IA con acceso de ${auth.agent.role} en la plataforma. Puedes descubrir y ejecutar herramientas usando 'tools/list' y 'tools/call'.`,
          },
        });
      }

      // 2. Initialized Notification
      case 'notifications/initialized': {
        return NextResponse.json({ jsonrpc: '2.0', id: null, result: {} });
      }

      // 3. Ping
      case 'ping': {
        return NextResponse.json({ jsonrpc: '2.0', id, result: {} });
      }

      // 4. Tools Listing
      case 'tools/list': {
        const mcpTools = PLATFORM_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: {
            type: 'object',
            properties: t.parameters.properties,
            required: t.parameters.required || [],
          },
        }));

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: mcpTools,
          },
        });
      }

      // 5. Tool Calling
      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        if (!toolName) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing tool name in params' },
          });
        }

        const executionResult = await executeToolCall(toolName, toolArgs, {
          agent: auth.agent,
          request_id: requestId,
          dry_run: Boolean(toolArgs.dry_run),
        });

        if (!executionResult.success && executionResult.pending_confirmation_id) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'PENDING_HUMAN_CONFIRMATION',
                      message: executionResult.message,
                      confirmation_id: executionResult.pending_confirmation_id,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: false,
            },
          });
        }

        if (!executionResult.success) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `ERROR: ${executionResult.error}` }],
              isError: true,
            },
          });
        }

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: typeof executionResult.data === 'string' 
                  ? executionResult.data 
                  : JSON.stringify(executionResult.data || executionResult, null, 2),
              },
            ],
            isError: false,
          },
        });
      }

      // 6. Resources Listing
      case 'resources/list': {
        const db = getDatabase();
        const resources = [
          {
            uri: 'platform://status',
            name: 'Platform Status & Metrics',
            mimeType: 'application/json',
          },
          {
            uri: 'platform://settings',
            name: 'Platform Settings',
            mimeType: 'application/json',
          },
          ...Object.keys(db.tables).map((t) => ({
            uri: `database://${t}`,
            name: `Database Table: ${t}`,
            mimeType: 'application/json',
          })),
        ];

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: { resources },
        });
      }

      // 7. Prompts Listing
      case 'prompts/list': {
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            prompts: [
              {
                name: 'platform_diagnostic',
                description: 'Ejecuta un diagnóstico exhaustivo de la plataforma y del código',
              },
              {
                name: 'super_admin_mode',
                description: 'Instrucciones del sistema para el rol SUPER_ADMIN_AGENT',
              },
            ],
          },
        });
      }

      default:
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method '${method}' not found` },
        });
    }
  } catch (err: any) {
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: `Internal error: ${err.message}` },
    });
  }
}

#!/usr/bin/env node

/**
 * Universal AI-Agent MCP Stdio Bridge
 * 
 * Allows Claude Desktop, Cursor, Continue, Windsurf, and custom CLI agents
 * to seamlessly connect to the Universal AI-Agent Platform via standard I/O (stdio),
 * bypassing browser cookie proxies and Google AI Studio ingress wrappers.
 * 
 * Usage in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "my-app-agent": {
 *       "command": "node",
 *       "args": ["/absolute/path/to/scripts/mcp-agent-bridge.js"],
 *       "env": {
 *         "AGENT_API_KEY": "ag_super_master_live_key_999",
 *         "PLATFORM_BASE_URL": "http://localhost:3000"
 *       }
 *     }
 *   }
 * }
 */

const readline = require('readline');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Parse configuration from env or CLI flags
const args = process.argv.slice(2);
function getArg(flag, envVar, fallback) {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return process.env[envVar] || fallback;
}

const AGENT_API_KEY = getArg('--key', 'AGENT_API_KEY', 'ag_super_master_live_key_999');
const PLATFORM_BASE_URL = getArg('--url', 'PLATFORM_BASE_URL', 'http://localhost:3000').replace(/\/$/, '');

// Log to stderr (MCP uses stderr for debug messages, stdout MUST strictly be JSON-RPC)
function log(...msg) {
  process.stderr.write(`[MCP-Bridge] ${msg.join(' ')}\n`);
}

log(`Iniciando MCP Stdio Bridge...`);
log(`Base URL: ${PLATFORM_BASE_URL}`);
log(`Agent Key: ${AGENT_API_KEY ? AGENT_API_KEY.slice(0, 12) + '...' : '(ninguna)'}`);

// Helper: HTTP/HTTPS fetch with authorization
function requestApi(endpoint, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    try {
      const fullUrl = new URL(endpoint.startsWith('http') ? endpoint : `${PLATFORM_BASE_URL}${endpoint}`);
      const isHttps = fullUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const payload = body ? JSON.stringify(body) : null;
      const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${AGENT_API_KEY}`,
        'X-Agent-Key': AGENT_API_KEY,
        'User-Agent': 'MCP-Stdio-Bridge/1.0',
      };

      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = transport.request(
        fullUrl,
        {
          method,
          headers,
          timeout: 30000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 400) {
                try {
                  const parsedErr = JSON.parse(data);
                  resolve({
                    isError: true,
                    status: res.statusCode,
                    error: parsedErr.error || parsedErr.message || `HTTP ${res.statusCode}: ${data.slice(0, 200)}`,
                  });
                } catch {
                  resolve({
                    isError: true,
                    status: res.statusCode,
                    error: `HTTP ${res.statusCode}: ${data.slice(0, 200)}`,
                  });
                }
                return;
              }

              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (err) {
              resolve({
                isError: true,
                error: `Failed to parse response: ${err.message}. Raw: ${data.slice(0, 200)}`,
              });
            }
          });
        }
      );

      req.on('error', (err) => {
        resolve({
          isError: true,
          error: `Network request failed: ${err.message}`,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          isError: true,
          error: 'Request timed out after 30 seconds',
        });
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    } catch (err) {
      resolve({
        isError: true,
        error: `Unexpected error: ${err.message}`,
      });
    }
  });
}

// Fallback catalog of tools in case network is delayed
const LOCAL_FALLBACK_TOOLS = [
  {
    name: 'platform_read',
    description: 'Obtiene una visión general completa del estado del sistema, entorno, métricas y agentes.',
    inputSchema: {
      type: 'object',
      properties: {
        include_env: { type: 'boolean', description: 'Incluir variables no sensibles' },
        include_db_summary: { type: 'boolean', description: 'Incluir resumen de base de datos' },
      },
    },
  },
  {
    name: 'file_read',
    description: 'Lee el contenido de un archivo del proyecto con soporte de paginación y números de línea.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta relativa del archivo' },
        offset: { type: 'number', description: 'Línea de inicio' },
        limit: { type: 'number', description: 'Número de líneas a leer' },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_write',
    description: 'Crea o sobrescribe un archivo del proyecto con snapshot de respaldo automático.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta relativa del archivo' },
        content: { type: 'string', description: 'Contenido completo a escribir' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'file_edit',
    description: 'Edita quirúrgicamente un archivo reemplazando una cadena exacta con respaldo automático.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta relativa del archivo' },
        old_string: { type: 'string', description: 'Texto exacto a reemplazar' },
        new_string: { type: 'string', description: 'Nuevo texto de reemplazo' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'file_list',
    description: 'Lista archivos y carpetas del proyecto.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta del directorio' },
        recursive: { type: 'boolean', description: 'Listar recursivamente' },
      },
    },
  },
  {
    name: 'file_grep',
    description: 'Busca expresiones regulares o cadenas en los archivos del proyecto.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Patrón de búsqueda' },
        path: { type: 'string', description: 'Subdirectorio donde buscar' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'database_query',
    description: 'Consulta y filtra registros en las tablas de la base de datos de la plataforma.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla' },
        filter: { type: 'object', description: 'Filtros clave-valor' },
        limit: { type: 'number', description: 'Límite de registros' },
      },
      required: ['table'],
    },
  },
  {
    name: 'database_insert',
    description: 'Inserta un nuevo registro en una tabla.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla' },
        record: { type: 'object', description: 'Objeto con datos del registro' },
      },
      required: ['table', 'record'],
    },
  },
  {
    name: 'database_create_table',
    description: 'Crea una nueva tabla dinámica en la base de datos.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre de la tabla' },
        description: { type: 'string', description: 'Descripción de la tabla' },
        columns: { type: 'array', description: 'Definición de columnas' },
      },
      required: ['name'],
    },
  },
  {
    name: 'process_exec',
    description: 'Ejecuta comandos del sistema (bash) de forma controlada.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Comando a ejecutar' },
        cwd: { type: 'string', description: 'Directorio de trabajo' },
        timeout_ms: { type: 'number', description: 'Timeout en milisegundos' },
      },
      required: ['command'],
    },
  },
  {
    name: 'tests_run',
    description: 'Ejecuta validaciones del codebase (TypeScript typecheck o ESLint).',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'typecheck', 'lint'], description: 'Tipo de prueba' },
      },
    },
  },
  {
    name: 'backups_rollback',
    description: 'Revierte el sistema a un snapshot o backup previo.',
    inputSchema: {
      type: 'object',
      properties: {
        backup_id: { type: 'string', description: 'ID del respaldo a restaurar' },
      },
      required: ['backup_id'],
    },
  },
];

// JSON-RPC Response Helper
function sendResponse(id, result, error = null) {
  const response = {
    jsonrpc: '2.0',
    id: id !== undefined ? id : null,
  };

  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }

  const jsonStr = JSON.stringify(response);
  process.stdout.write(jsonStr + '\n');
}

// Request Handler
async function handleJsonRpc(request) {
  const { id, method, params } = request;

  log(`RPC Recibido: ${method} (id=${id})`);

  switch (method) {
    case 'initialize': {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: { listChanged: true },
          prompts: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
        },
        serverInfo: {
          name: 'universal-platform-mcp-bridge',
          version: '1.0.0',
        },
      });
      break;
    }

    case 'notifications/initialized':
    case 'initialized': {
      // Notification without response
      log('MCP handshake inicializado con éxito');
      break;
    }

    case 'ping': {
      sendResponse(id, {});
      break;
    }

    case 'tools/list': {
      try {
        // Attempt to fetch fresh tools from the platform backend
        const remoteTools = await requestApi('/api/v1/tools', 'GET');
        if (remoteTools && !remoteTools.isError && Array.isArray(remoteTools.tools)) {
          const formatted = remoteTools.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters || { type: 'object', properties: {} },
          }));
          log(`Cargadas ${formatted.length} herramientas remotas autorizadas para el agente`);
          sendResponse(id, { tools: formatted });
          return;
        }
      } catch (err) {
        log(`Advertencia al obtener herramientas remotas: ${err.message}. Usando catálogo local.`);
      }

      // Fallback
      sendResponse(id, { tools: LOCAL_FALLBACK_TOOLS });
      break;
    }

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      log(`Ejecutando herramienta: ${toolName} con argumentos:`, JSON.stringify(toolArgs));

      try {
        // Forward execution to the platform API endpoint
        const execResult = await requestApi('/api/v1/tools/execute', 'POST', {
          tool: toolName,
          arguments: toolArgs,
        });

        if (execResult.isError) {
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: `❌ Error en ejecución de ${toolName}:\n${execResult.error || JSON.stringify(execResult)}`,
              },
            ],
            isError: true,
          });
          return;
        }

        const formattedText = typeof execResult.data === 'string'
          ? execResult.data
          : JSON.stringify(execResult.data !== undefined ? execResult.data : execResult, null, 2);

        sendResponse(id, {
          content: [
            {
              type: 'text',
              text: formattedText,
            },
          ],
          isError: execResult.success === false,
        });
      } catch (err) {
        sendResponse(id, {
          content: [
            {
              type: 'text',
              text: `❌ Excepción ejecutando herramienta ${toolName}: ${err.message}`,
            },
          ],
          isError: true,
        });
      }
      break;
    }

    case 'resources/list': {
      sendResponse(id, {
        resources: [
          {
            uri: 'platform://status',
            name: 'Platform Status & Metrics',
            description: 'Telemetría del sistema, agentes activos y base de datos',
            mimeType: 'application/json',
          },
          {
            uri: 'platform://audit',
            name: 'Audit Trail',
            description: 'Registro de auditoría de todas las acciones del agente',
            mimeType: 'application/json',
          },
        ],
      });
      break;
    }

    case 'prompts/list': {
      sendResponse(id, {
        prompts: [
          {
            name: 'super_admin_diagnostic',
            description: 'Ejecuta un diagnóstico completo del sistema y valida el codebase',
          },
          {
            name: 'create_fullstack_feature',
            description: 'Crea una tabla en base de datos y su interfaz de usuario',
            arguments: [
              { name: 'feature_name', description: 'Nombre de la funcionalidad', required: true },
            ],
          },
        ],
      });
      break;
    }

    default: {
      if (id !== undefined) {
        sendResponse(id, null, {
          code: -32601,
          message: `Method not found: ${method}`,
        });
      }
      break;
    }
  }
}

// Stdio Reader
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const parsed = JSON.parse(trimmed);
    handleJsonRpc(parsed);
  } catch (err) {
    log(`Error parseando JSON-RPC entrante: ${err.message} -> ${trimmed}`);
    sendResponse(null, null, {
      code: -32700,
      message: `Parse error: ${err.message}`,
    });
  }
});

process.on('SIGINT', () => {
  log('Cerrando MCP Stdio Bridge...');
  process.exit(0);
});

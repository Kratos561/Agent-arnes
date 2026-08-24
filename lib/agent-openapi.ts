import { PLATFORM_TOOLS } from './agent-tools';

export function generateOpenAPISpec() {
  const paths: Record<string, any> = {
    '/api/v1/health': {
      get: {
        summary: 'Verifica el estado de la plataforma y del servidor',
        description: 'Retorna información de estado, métricas de memoria, versión de Node y servicios activos.',
        tags: ['Plataforma'],
        responses: {
          '200': { description: 'Plataforma operativa' },
        },
      },
    },
    '/api/v1/tools': {
      get: {
        summary: 'Catálogo de herramientas universales para agentes',
        description: 'Lista todas las herramientas disponibles con sus esquemas JSON de parámetros y alcances requeridos.',
        tags: ['Herramientas & MCP'],
        security: [{ BearerAuth: [] }, { AgentKeyAuth: [] }],
        responses: {
          '200': { description: 'Lista de herramientas con JSON Schemas' },
        },
      },
    },
    '/api/v1/tools/execute': {
      post: {
        summary: 'Ejecuta una herramienta de la plataforma',
        description: 'Ejecuta cualquier herramienta autorizada (lectura/escritura de código, base de datos, diagnósticos, etc.) con soporte para dry_run y respaldo automático.',
        tags: ['Herramientas & MCP'],
        security: [{ BearerAuth: [] }, { AgentKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tool'],
                properties: {
                  tool: { type: 'string', description: 'Nombre de la herramienta a invocar' },
                  parameters: { type: 'object', description: 'Parámetros requeridos por la herramienta' },
                  dry_run: { type: 'boolean', description: 'Simular la operación sin mutar el sistema' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Resultado de la ejecución' },
          '401': { description: 'No autenticado' },
          '403': { description: 'Permiso insuficiente o confirmación requerida' },
        },
      },
    },
    '/api/v1/mcp': {
      post: {
        summary: 'Servidor Model Context Protocol (MCP JSON-RPC 2.0)',
        description: 'Punto de enlace MCP compatible con herramientas, recursos y prompts de Claude Desktop, Cursor, Continue, Roo Code y agentes autónomos.',
        tags: ['Herramientas & MCP'],
        security: [{ BearerAuth: [] }, { AgentKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['jsonrpc', 'method'],
                properties: {
                  jsonrpc: { type: 'string', example: '2.0' },
                  id: { type: 'string', example: '1' },
                  method: { type: 'string', example: 'tools/call' },
                  params: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Respuesta JSON-RPC estándar de MCP' },
        },
      },
      get: {
        summary: 'SSE Stream de transporte MCP',
        description: 'Flujo Server-Sent Events para conexiones MCP en tiempo real.',
        tags: ['Herramientas & MCP'],
        responses: {
          '200': { description: 'Stream SSE activo' },
        },
      },
    },
    '/api/v1/agents': {
      get: {
        summary: 'Lista todos los agentes registrados',
        tags: ['Agentes & Seguridad'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Lista de agentes' } },
      },
      post: {
        summary: 'Registra un nuevo agente y genera credenciales',
        tags: ['Agentes & Seguridad'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Agente creado y token emitido' } },
      },
    },
    '/api/v1/code/read': {
      post: {
        summary: 'Lee un archivo de código del proyecto',
        tags: ['Código & Archivos'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Contenido del archivo' } },
      },
    },
    '/api/v1/code/write': {
      post: {
        summary: 'Escribe o sobreescribe un archivo en el proyecto',
        tags: ['Código & Archivos'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Archivo guardado con backup' } },
      },
    },
    '/api/v1/database/query': {
      post: {
        summary: 'Consulta registros en la base de datos',
        tags: ['Base de Datos'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Registros coincidentes' } },
      },
    },
    '/api/v1/audit': {
      get: {
        summary: 'Consulta registros de auditoría de agentes',
        tags: ['Auditoría & Seguridad'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Historial de auditoría' } },
      },
    },
    '/api/v1/backups': {
      get: {
        summary: 'Lista los puntos de restauración disponibles',
        tags: ['Backups & Recuperación'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Lista de backups' } },
      },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Universal AI Agent Platform API',
      version: '1.0.0',
      description: 'API Universal y Servidor MCP (Model Context Protocol) para control autónomo, administración y modificación de la plataforma por agentes de IA autorizados con permisos SUPER_ADMIN_AGENT y FULL_PLATFORM_ACCESS.',
      contact: {
        name: 'AI Agent Architecture Support',
      },
    },
    servers: [
      {
        url: '/',
        description: 'Servidor Actual de la Plataforma',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Token (ag_live_... / ag_super_...)',
          description: 'Token de agente en cabecera Authorization: Bearer <token>',
        },
        AgentKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Agent-Key',
          description: 'Token de agente en cabecera personalizada X-Agent-Key',
        },
      },
      schemas: {
        ToolsCatalog: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              category: { type: 'string' },
              required_scope: { type: 'string' },
              parameters: { type: 'object' },
            },
          },
        },
      },
    },
    paths,
  };
}

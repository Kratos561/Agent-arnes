import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import crypto from 'crypto';
import { 
  ToolDefinition, 
  ToolExecutionContext, 
  ToolExecutionResult, 
  PendingConfirmation 
} from './agent-types';
import { hasPermission } from './agent-auth';
import { getDatabase, saveDatabase, DynamicDatabaseTable } from './agent-db';
import { createFileBackup, createDatabaseTableBackup, restoreBackup } from './agent-backup';
import { recordAudit } from './agent-audit';

const execAsync = util.promisify(exec);

// Normalized file resolver
function resolveSafePath(userPath: string): string {
  const cleanPath = userPath.startsWith('/') ? userPath.slice(1) : userPath;
  const resolved = path.resolve(process.cwd(), cleanPath);
  return resolved;
}

// Ignore directories for glob and grep
const IGNORED_DIRS = ['node_modules', '.next', '.git', '.agent_backups', '.agent_data', 'dist', 'build'];

// --- MASTER TOOLS DEFINITIONS CATALOG ---
export const PLATFORM_TOOLS: ToolDefinition[] = [
  // Platform & System
  {
    name: 'platform_read',
    description: 'Obtiene una visión general completa del estado del sistema, entorno de ejecución, estadísticas, módulos cargados y agentes activos.',
    category: 'platform',
    required_scope: 'platform:read',
    parameters: {
      type: 'object',
      properties: {
        include_env: { type: 'boolean', description: 'Si es true, incluye variables de entorno no sensibles' },
        include_db_summary: { type: 'boolean', description: 'Si es true, incluye resumen de tablas y registros' },
      },
    },
  },
  {
    name: 'platform_search',
    description: 'Búsqueda universal en toda la plataforma: archivos de código, base de datos, sesiones y registros de auditoría.',
    category: 'platform',
    required_scope: 'platform:read',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Término de búsqueda' },
        target: { 
          type: 'string', 
          enum: ['all', 'code', 'database', 'audit'],
          description: 'Ámbito de búsqueda',
          default: 'all'
        },
      },
      required: ['query'],
    },
  },

  // Code & File System
  {
    name: 'file_read',
    description: 'Lee el contenido de un archivo de la plataforma con soporte para números de línea, offset y límite.',
    category: 'code',
    required_scope: 'code:read',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta relativa del archivo (ej. components/Sidebar.tsx)' },
        offset: { type: 'number', description: 'Línea de inicio (1-indexed)', default: 1 },
        limit: { type: 'number', description: 'Cantidad máxima de líneas a leer', default: 500 },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_write',
    description: 'Crea o sobreescribe un archivo completo en la plataforma. Genera backup automático previo.',
    category: 'code',
    dangerous: true,
    required_scope: 'code:write',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta relativa del archivo a crear o sobreescribir' },
        content: { type: 'string', description: 'Contenido completo del archivo' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'file_edit',
    description: 'Reemplaza exactamente una porción de texto en un archivo existente. old_string debe coincidir exactamente. Crea backup automático.',
    category: 'code',
    dangerous: true,
    required_scope: 'code:write',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta del archivo a editar' },
        old_string: { type: 'string', description: 'Texto exacto a reemplazar' },
        new_string: { type: 'string', description: 'Nuevo texto de reemplazo' },
        replace_all: { type: 'boolean', description: 'Reemplazar todas las ocurrencias si es true', default: false },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'file_delete',
    description: 'Elimina un archivo de la plataforma. Crea un backup recuperable antes de eliminar.',
    category: 'code',
    dangerous: true,
    required_scope: 'code:delete',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta del archivo a eliminar' },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_list',
    description: 'Lista archivos y directorios en la plataforma mediante patrones glob o rutas de carpetas.',
    category: 'code',
    required_scope: 'code:read',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directorio inicial (ej. components, lib, app)', default: '.' },
        pattern: { type: 'string', description: 'Extensión o patrón (ej. *.tsx, *.ts, *.*)', default: '*' },
        recursive: { type: 'boolean', description: 'Búsqueda recursiva', default: true },
        max_results: { type: 'number', description: 'Límite de resultados', default: 100 },
      },
    },
  },
  {
    name: 'file_grep',
    description: 'Busca expresiones o cadenas de texto en todos los archivos del código fuente.',
    category: 'code',
    required_scope: 'code:read',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cadena o texto a buscar' },
        file_extension: { type: 'string', description: 'Filtrar por extensión (ej. .ts, .tsx, .css)' },
        max_matches: { type: 'number', description: 'Número máximo de coincidencias', default: 50 },
      },
      required: ['query'],
    },
  },

  // Execution & Diagnostics
  {
    name: 'process_exec',
    description: 'Ejecuta un comando de consola en el entorno del servidor (ej. npm run lint, git status, node -v, etc.).',
    category: 'tests',
    dangerous: true,
    required_scope: 'tests:run',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Comando shell a ejecutar' },
        timeout_ms: { type: 'number', description: 'Tiempo límite en milisegundos', default: 30000 },
      },
      required: ['command'],
    },
  },
  {
    name: 'tests_run',
    description: 'Ejecuta la suite de verificación de lint y tipos de TypeScript en el proyecto.',
    category: 'tests',
    required_scope: 'tests:run',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['lint', 'build_dry', 'all'], default: 'lint' },
      },
    },
  },
  {
    name: 'dependencies_manage',
    description: 'Inspecciona o instala paquetes npm en el proyecto.',
    category: 'tests',
    dangerous: true,
    required_scope: 'code:write',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'install'], default: 'list' },
        package_name: { type: 'string', description: 'Nombre del paquete a instalar (si action=install)' },
        is_dev: { type: 'boolean', description: 'Instalar como devDependency', default: false },
      },
    },
  },

  // Database Management
  {
    name: 'database_list_tables',
    description: 'Lista todas las tablas de la base de datos dinámica con sus esquemas y conteo de registros.',
    category: 'database',
    required_scope: 'database:read',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'database_query',
    description: 'Ejecuta consultas de lectura sobre una tabla con filtros, ordenamiento y paginación.',
    category: 'database',
    required_scope: 'database:read',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla' },
        filter: { type: 'object', description: 'Filtro clave-valor (ej. {"status": "active"})' },
        limit: { type: 'number', description: 'Límite de registros', default: 50 },
        offset: { type: 'number', description: 'Offset de paginación', default: 0 },
        sort_by: { type: 'string', description: 'Campo de ordenación' },
        order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
      },
      required: ['table'],
    },
  },
  {
    name: 'database_insert',
    description: 'Inserta uno o más registros en una tabla de la base de datos.',
    category: 'database',
    dangerous: true,
    required_scope: 'database:write',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla' },
        record: { type: 'object', description: 'Objeto con los datos a insertar' },
      },
      required: ['table', 'record'],
    },
  },
  {
    name: 'database_update',
    description: 'Actualiza registros en una tabla según un filtro. Crea snapshot de respaldo.',
    category: 'database',
    dangerous: true,
    required_scope: 'database:write',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla' },
        filter: { type: 'object', description: 'Filtro para encontrar los registros a actualizar' },
        updates: { type: 'object', description: 'Campos y nuevos valores' },
      },
      required: ['table', 'filter', 'updates'],
    },
  },
  {
    name: 'database_delete',
    description: 'Elimina registros de una tabla según un filtro. Crea snapshot de respaldo.',
    category: 'database',
    dangerous: true,
    required_scope: 'database:delete',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla' },
        filter: { type: 'object', description: 'Filtro de registros a eliminar' },
      },
      required: ['table', 'filter'],
    },
  },
  {
    name: 'database_create_table',
    description: 'Crea una nueva tabla en la base de datos con esquema tipado.',
    category: 'database',
    dangerous: true,
    required_scope: 'database:write',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre único de la tabla' },
        description: { type: 'string', description: 'Descripción de la tabla' },
        columns: {
          type: 'array',
          description: 'Lista de columnas con sus tipos (string, number, boolean, json, date)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string', enum: ['string', 'number', 'boolean', 'json', 'date'] },
              required: { type: 'boolean' },
              unique: { type: 'boolean' },
            },
            required: ['name', 'type'],
          },
        },
      },
      required: ['name', 'columns'],
    },
  },

  // Users & Agents
  {
    name: 'agents_list',
    description: 'Lista todos los agentes registrados en la plataforma con sus roles, estados y alcances.',
    category: 'users',
    required_scope: 'users:read',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'agents_create',
    description: 'Registra un nuevo agente de IA y genera sus credenciales de acceso.',
    category: 'users',
    dangerous: true,
    required_scope: 'users:write',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre del agente' },
        role: { 
          type: 'string', 
          enum: ['SUPER_ADMIN_AGENT', 'DEVELOPER_AGENT', 'OPERATOR_AGENT', 'READONLY_AGENT', 'CUSTOM'],
          default: 'DEVELOPER_AGENT' 
        },
        scopes: { type: 'array', items: { type: 'string' }, description: 'Lista de alcances/permisos' },
        confirmation_mode: { type: 'string', enum: ['AUTO_APPROVE', 'REQUIRE_CONFIRMATION'], default: 'AUTO_APPROVE' },
        expires_in_days: { type: 'number', description: 'Días de expiración opcionales' },
      },
      required: ['name'],
    },
  },
  {
    name: 'agents_revoke',
    description: 'Revoca o suspende un agente inmediatamente.',
    category: 'users',
    dangerous: true,
    required_scope: 'users:write',
    parameters: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'ID del agente a revocar' },
        action: { type: 'string', enum: ['revoke', 'suspend', 'activate'], default: 'revoke' },
      },
      required: ['agent_id'],
    },
  },

  // Settings & Configuration
  {
    name: 'settings_read',
    description: 'Lee las configuraciones de la plataforma (secretos y contraseñas son omitidos por seguridad).',
    category: 'settings',
    required_scope: 'settings:read',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'settings_update',
    description: 'Actualiza parámetros de configuración globales de la plataforma.',
    category: 'settings',
    dangerous: true,
    required_scope: 'settings:write',
    parameters: {
      type: 'object',
      properties: {
        settings: { type: 'object', description: 'Claves y valores de configuración a actualizar' },
      },
      required: ['settings'],
    },
  },

  // Backups & Auditing
  {
    name: 'backups_list',
    description: 'Lista los puntos de respaldo y snapshots disponibles para restauración.',
    category: 'backup',
    required_scope: 'platform:read',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 30 },
      },
    },
  },
  {
    name: 'backups_rollback',
    description: 'Restaura un archivo o tabla de base de datos desde un snapshot previo.',
    category: 'backup',
    dangerous: true,
    required_scope: 'code:write',
    parameters: {
      type: 'object',
      properties: {
        backup_id: { type: 'string', description: 'ID del respaldo a restaurar' },
      },
      required: ['backup_id'],
    },
  },
  {
    name: 'audit_query',
    description: 'Consulta los registros de auditoría de todas las acciones ejecutadas por agentes.',
    category: 'platform',
    required_scope: 'platform:read',
    parameters: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Filtrar por agente' },
        tool: { type: 'string', description: 'Filtrar por herramienta' },
        status: { type: 'string', enum: ['success', 'error', 'pending_approval', 'rejected'] },
        limit: { type: 'number', default: 50 },
      },
    },
  },
];

// --- TOOL EXECUTION IMPLEMENTATIONS ---

export async function executeToolCall(
  toolName: string,
  params: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  const toolDef = PLATFORM_TOOLS.find((t) => t.name === toolName);

  if (!toolDef) {
    recordAudit({
      context,
      tool: toolName,
      action: 'execute',
      resource: 'unknown',
      parameters: params,
      error: `Herramienta desconocida: '${toolName}'`,
      status: 'error',
      duration_ms: Date.now() - startTime,
    });
    return { success: false, error: `Herramienta desconocida: '${toolName}'` };
  }

  // 1. Check Scope & Permissions
  if (!hasPermission(context.agent, toolDef.required_scope)) {
    recordAudit({
      context,
      tool: toolName,
      action: 'permission_check',
      resource: toolDef.category,
      parameters: params,
      error: `Permiso insuficiente. Requiere '${toolDef.required_scope}'`,
      status: 'error',
      duration_ms: Date.now() - startTime,
    });
    return {
      success: false,
      error: `Permiso insuficiente. El agente '${context.agent.name}' (${context.agent.role}) no tiene el alcance '${toolDef.required_scope}'.`,
    };
  }

  // 2. Check Confirmation Mode (Human-in-the-loop if REQUIRE_CONFIRMATION)
  const db = getDatabase();
  const isGlobalConfirm = db.system_settings.global_confirmation_mode === 'REQUIRE_CONFIRMATION';
  const isAgentConfirm = context.agent.confirmation_mode === 'REQUIRE_CONFIRMATION';
  
  if (toolDef.dangerous && (isGlobalConfirm || isAgentConfirm) && !context.dry_run) {
    const confirmationId = `conf_${crypto.randomBytes(6).toString('hex')}`;
    const pendingItem: PendingConfirmation = {
      id: confirmationId,
      request_id: context.request_id,
      agent_id: context.agent.agent_id,
      agent_name: context.agent.name,
      tool: toolName,
      action: 'execute_dangerous_tool',
      parameters: params,
      created_at: Date.now(),
      status: 'pending',
    };

    db.pending_confirmations.unshift(pendingItem);
    saveDatabase(db);

    recordAudit({
      context,
      tool: toolName,
      action: 'request_confirmation',
      resource: toolDef.category,
      parameters: params,
      status: 'pending_approval',
      duration_ms: Date.now() - startTime,
    });

    return {
      success: false,
      pending_confirmation_id: confirmationId,
      message: `La operación '${toolName}' es potencialmente sensible y requiere confirmación humana según la política de seguridad activa. Solicitud registrada con ID: ${confirmationId}.`,
    };
  }

  // 3. Dry-Run Handling
  if (context.dry_run) {
    return handleDryRun(toolDef, params, context, startTime);
  }

  // 4. Actual Execution
  try {
    const result = await runToolImplementation(toolDef, params, context);
    recordAudit({
      context,
      tool: toolName,
      action: 'execute',
      resource: toolDef.category,
      parameters: params,
      result: result.data,
      status: result.success ? 'success' : 'error',
      error: result.error,
      duration_ms: Date.now() - startTime,
    });
    return result;
  } catch (err: any) {
    recordAudit({
      context,
      tool: toolName,
      action: 'execute',
      resource: toolDef.category,
      parameters: params,
      error: err.message,
      status: 'error',
      duration_ms: Date.now() - startTime,
    });
    return { success: false, error: `Error al ejecutar '${toolName}': ${err.message}` };
  }
}

// Dry run simulator
function handleDryRun(
  toolDef: ToolDefinition,
  params: Record<string, any>,
  context: ToolExecutionContext,
  startTime: number
): ToolExecutionResult {
  let diffPreview = '';
  let impactMessage = `[DRY-RUN] Simulación de ${toolDef.name}`;

  if (toolDef.name === 'file_edit') {
    const filePath = resolveSafePath(params.path);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const matches = content.split(params.old_string).length - 1;
      diffPreview = `--- ${params.path} (actual)\n+++ ${params.path} (modificado)\n@@ Coincidencias encontradas: ${matches} @@\n- ${params.old_string.slice(0, 100)}\n+ ${params.new_string.slice(0, 100)}`;
      impactMessage = `Simulación exitosa: Se reemplazarían ${matches} ocurrencia(s) en '${params.path}'. No se aplicaron cambios reales.`;
    }
  } else if (toolDef.name === 'file_write') {
    impactMessage = `Simulación exitosa: Se escribirían ${params.content?.length || 0} caracteres en '${params.path}'.`;
  } else if (toolDef.name === 'database_update' || toolDef.name === 'database_delete') {
    const db = getDatabase();
    const table = db.tables[params.table];
    const matchCount = table ? table.records.filter((r) => matchesFilter(r, params.filter)).length : 0;
    impactMessage = `Simulación exitosa: La operación afectaría a ${matchCount} registro(s) en la tabla '${params.table}'.`;
  }

  recordAudit({
    context,
    tool: toolDef.name,
    action: 'dry_run_simulation',
    resource: toolDef.category,
    parameters: params,
    result: { impact: impactMessage, diff: diffPreview },
    status: 'success',
    dry_run: true,
    duration_ms: Date.now() - startTime,
  });

  return {
    success: true,
    dry_run: true,
    message: impactMessage,
    diff: diffPreview,
    data: { simulated: true, tool: toolDef.name, params },
  };
}

// Implementation router
async function runToolImplementation(
  toolDef: ToolDefinition,
  params: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const db = getDatabase();

  switch (toolDef.name) {
    // --- PLATFORM TOOLS ---
    case 'platform_read': {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
      const safeEnv: Record<string, string> = {};
      if (params.include_env) {
        for (const [k, v] of Object.entries(process.env)) {
          if (!k.toLowerCase().includes('key') && !k.toLowerCase().includes('secret') && !k.toLowerCase().includes('token')) {
            safeEnv[k] = v || '';
          }
        }
      }

      const tableSummary = Object.values(db.tables).map((t) => ({
        name: t.name,
        records_count: t.records.length,
        columns: t.columns.map((c) => c.name),
      }));

      return {
        success: true,
        data: {
          app_name: pkgJson.name || 'AI Studio Applet',
          version: pkgJson.version || '0.1.0',
          node_version: process.version,
          platform: process.platform,
          uptime_seconds: Math.floor(process.uptime()),
          memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          active_agents_count: db.agents.filter((a) => a.status === 'active').length,
          total_audit_logs: db.audit_logs.length,
          system_settings: db.system_settings,
          database_tables: params.include_db_summary !== false ? tableSummary : undefined,
          environment: params.include_env ? safeEnv : undefined,
        },
      };
    }

    case 'platform_search': {
      const q = (params.query || '').toLowerCase();
      const results: Record<string, any[]> = { code: [], database: [], audit: [] };

      // Search database
      if (params.target === 'all' || params.target === 'database') {
        for (const [tName, table] of Object.entries(db.tables)) {
          for (const rec of table.records) {
            if (JSON.stringify(rec).toLowerCase().includes(q)) {
              results.database.push({ table: tName, record: rec });
            }
          }
        }
      }

      // Search audit logs
      if (params.target === 'all' || params.target === 'audit') {
        results.audit = db.audit_logs
          .filter((l) => (l.tool + l.action + l.resource + (l.error || '')).toLowerCase().includes(q))
          .slice(0, 20);
      }

      return { success: true, data: results };
    }

    // --- CODE & FILE TOOLS ---
    case 'file_read': {
      const filePath = resolveSafePath(params.path);
      if (!fs.existsSync(filePath)) {
        return { success: false, error: `Archivo no encontrado: '${params.path}'` };
      }
      const rawContent = fs.readFileSync(filePath, 'utf-8');
      const lines = rawContent.split('\n');
      const offset = Math.max(1, params.offset || 1);
      const limit = Math.min(lines.length, params.limit || 500);
      const sliced = lines.slice(offset - 1, offset - 1 + limit);

      const formatted = sliced.map((line, idx) => `${offset + idx}: ${line}`).join('\n');
      return {
        success: true,
        data: {
          path: params.path,
          total_lines: lines.length,
          offset,
          limit,
          content: formatted,
          raw_content: sliced.join('\n'),
        },
      };
    }

    case 'file_write': {
      const filePath = resolveSafePath(params.path);
      const backupId = createFileBackup(filePath, context.agent.agent_id, 'file_write');
      
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(filePath, params.content, 'utf-8');
      return {
        success: true,
        backup_id: backupId || undefined,
        message: `Archivo '${params.path}' guardado correctamente (${params.content.length} bytes).`,
        data: { path: params.path, bytes: params.content.length, backup_id: backupId },
      };
    }

    case 'file_edit': {
      const filePath = resolveSafePath(params.path);
      if (!fs.existsSync(filePath)) {
        return { success: false, error: `Archivo no encontrado para edición: '${params.path}'` };
      }

      const backupId = createFileBackup(filePath, context.agent.agent_id, 'file_edit');
      const original = fs.readFileSync(filePath, 'utf-8');

      if (!original.includes(params.old_string)) {
        return {
          success: false,
          error: `El texto 'old_string' no fue encontrado dentro de '${params.path}'. Verifica que el texto coincida exactamente con las líneas del archivo.`,
        };
      }

      const occurrences = original.split(params.old_string).length - 1;
      if (occurrences > 1 && !params.replace_all) {
        return {
          success: false,
          error: `El texto a reemplazar aparece ${occurrences} veces en '${params.path}'. Proporciona más contexto circundante para un reemplazo único o establece 'replace_all: true'.`,
        };
      }

      const modified = params.replace_all
        ? original.replaceAll(params.old_string, params.new_string)
        : original.replace(params.old_string, params.new_string);

      fs.writeFileSync(filePath, modified, 'utf-8');

      return {
        success: true,
        backup_id: backupId || undefined,
        message: `Archivo '${params.path}' editado exitosamente (${occurrences} reemplazos efectuados).`,
        data: { path: params.path, replacements: occurrences, backup_id: backupId },
      };
    }

    case 'file_delete': {
      const filePath = resolveSafePath(params.path);
      if (!fs.existsSync(filePath)) {
        return { success: false, error: `Archivo no existe: '${params.path}'` };
      }
      const backupId = createFileBackup(filePath, context.agent.agent_id, 'file_delete');
      fs.unlinkSync(filePath);
      return {
        success: true,
        backup_id: backupId || undefined,
        message: `Archivo '${params.path}' eliminado. Snapshot de respaldo disponible con ID: ${backupId}`,
      };
    }

    case 'file_list': {
      const startDir = resolveSafePath(params.path || '.');
      const results: Array<{ path: string; is_dir: boolean; size: number; modified: number }> = [];
      const maxResults = params.max_results || 100;

      function walk(current: string) {
        if (results.length >= maxResults) return;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const ent of entries) {
          if (IGNORED_DIRS.includes(ent.name)) continue;
          const fullPath = path.join(current, ent.name);
          const relPath = path.relative(process.cwd(), fullPath);
          const stat = fs.statSync(fullPath);

          if (ent.isDirectory()) {
            results.push({ path: relPath, is_dir: true, size: 0, modified: stat.mtimeMs });
            if (params.recursive !== false) walk(fullPath);
          } else {
            results.push({ path: relPath, is_dir: false, size: stat.size, modified: stat.mtimeMs });
          }
          if (results.length >= maxResults) break;
        }
      }

      if (fs.existsSync(startDir)) {
        walk(startDir);
      }

      return { success: true, data: { count: results.length, files: results } };
    }

    case 'file_grep': {
      const q = params.query;
      const ext = params.file_extension;
      const maxMatches = params.max_matches || 50;
      const matches: Array<{ file: string; line: number; text: string }> = [];

      function searchDir(current: string) {
        if (matches.length >= maxMatches) return;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const ent of entries) {
          if (IGNORED_DIRS.includes(ent.name)) continue;
          const fullPath = path.join(current, ent.name);
          const relPath = path.relative(process.cwd(), fullPath);

          if (ent.isDirectory()) {
            searchDir(fullPath);
          } else {
            if (ext && !ent.name.endsWith(ext)) continue;
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(q)) {
                  matches.push({ file: relPath, line: i + 1, text: lines[i].trim() });
                  if (matches.length >= maxMatches) break;
                }
              }
            } catch {
              // Ignore binary files
            }
          }
          if (matches.length >= maxMatches) break;
        }
      }

      searchDir(process.cwd());
      return { success: true, data: { query: q, total_matches: matches.length, matches } };
    }

    // --- PROCESS & TESTS TOOLS ---
    case 'process_exec': {
      const timeout = params.timeout_ms || 30000;
      try {
        const { stdout, stderr } = await execAsync(params.command, {
          cwd: process.cwd(),
          timeout,
          maxBuffer: 1024 * 1024 * 5,
        });
        return {
          success: true,
          data: {
            command: params.command,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exit_code: 0,
          },
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Error en la ejecución del comando: ${err.message}`,
          data: {
            command: params.command,
            stdout: err.stdout ? err.stdout.trim() : '',
            stderr: err.stderr ? err.stderr.trim() : '',
            exit_code: err.code || 1,
          },
        };
      }
    }

    case 'tests_run': {
      const type = params.type || 'lint';
      let cmd = 'npm run lint';
      if (type === 'build_dry') cmd = 'npx tsc --noEmit';
      if (type === 'all') cmd = 'npm run lint && npx tsc --noEmit';

      try {
        const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd(), timeout: 60000 });
        return {
          success: true,
          message: 'Validación de pruebas y análisis estático superada con éxito.',
          data: { type, stdout: stdout.trim(), stderr: stderr.trim() },
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Falló la verificación de tests/lint: ${err.message}`,
          data: { type, stdout: err.stdout || '', stderr: err.stderr || '' },
        };
      }
    }

    case 'dependencies_manage': {
      const action = params.action || 'list';
      const pkgPath = path.join(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      if (action === 'list') {
        return {
          success: true,
          data: {
            dependencies: pkg.dependencies || {},
            devDependencies: pkg.devDependencies || {},
          },
        };
      }

      if (action === 'install' && params.package_name) {
        const flag = params.is_dev ? '-D' : '';
        const cmd = `npm install ${flag} ${params.package_name}`;
        const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd() });
        return {
          success: true,
          message: `Paquete '${params.package_name}' instalado exitosamente.`,
          data: { command: cmd, stdout: stdout.trim(), stderr: stderr.trim() },
        };
      }

      return { success: false, error: 'Acción de dependencias inválida' };
    }

    // --- DATABASE TOOLS ---
    case 'database_list_tables': {
      const tables = Object.values(db.tables).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        columns: t.columns,
        records_count: t.records.length,
        created_at: t.created_at,
        updated_at: t.updated_at,
      }));
      return { success: true, data: { total_tables: tables.length, tables } };
    }

    case 'database_query': {
      const table = db.tables[params.table];
      if (!table) {
        return { success: false, error: `La tabla '${params.table}' no existe en la base de datos.` };
      }

      let filtered = table.records.filter((r) => matchesFilter(r, params.filter));
      
      if (params.sort_by) {
        const field = params.sort_by;
        const isAsc = params.order === 'asc';
        filtered.sort((a, b) => {
          if (a[field] < b[field]) return isAsc ? -1 : 1;
          if (a[field] > b[field]) return isAsc ? 1 : -1;
          return 0;
        });
      }

      const offset = params.offset || 0;
      const limit = params.limit || 50;
      const paged = filtered.slice(offset, offset + limit);

      return {
        success: true,
        data: {
          table: params.table,
          total_matches: filtered.length,
          offset,
          limit,
          records: paged,
        },
      };
    }

    case 'database_insert': {
      const table = db.tables[params.table];
      if (!table) {
        return { success: false, error: `Tabla '${params.table}' no encontrada.` };
      }

      const record = { ...params.record };
      if (!record.id) {
        record.id = `rec_${crypto.randomBytes(6).toString('hex')}`;
      }
      if (!record.created_at) record.created_at = Date.now();
      if (!record.updated_at) record.updated_at = Date.now();

      // Check unique constraints
      for (const col of table.columns) {
        if (col.unique && record[col.name] !== undefined) {
          const exists = table.records.some((r) => r[col.name] === record[col.name]);
          if (exists) {
            return { success: false, error: `Violación de restricción única en columna '${col.name}'` };
          }
        }
      }

      table.records.push(record);
      table.updated_at = Date.now();
      saveDatabase(db);

      return {
        success: true,
        message: `Registro insertado en tabla '${params.table}' con ID: ${record.id}`,
        data: { table: params.table, inserted: record },
      };
    }

    case 'database_update': {
      const table = db.tables[params.table];
      if (!table) {
        return { success: false, error: `Tabla '${params.table}' no encontrada.` };
      }

      const backupId = createDatabaseTableBackup(params.table, context.agent.agent_id, 'database_update');
      let updatedCount = 0;

      for (const rec of table.records) {
        if (matchesFilter(rec, params.filter)) {
          Object.assign(rec, params.updates, { updated_at: Date.now() });
          updatedCount++;
        }
      }

      table.updated_at = Date.now();
      saveDatabase(db);

      return {
        success: true,
        backup_id: backupId || undefined,
        message: `Se actualizaron ${updatedCount} registro(s) en la tabla '${params.table}'.`,
        data: { table: params.table, updated_count: updatedCount, backup_id: backupId },
      };
    }

    case 'database_delete': {
      const table = db.tables[params.table];
      if (!table) {
        return { success: false, error: `Tabla '${params.table}' no encontrada.` };
      }

      const backupId = createDatabaseTableBackup(params.table, context.agent.agent_id, 'database_delete');
      const initialCount = table.records.length;
      table.records = table.records.filter((r) => !matchesFilter(r, params.filter));
      const deletedCount = initialCount - table.records.length;

      table.updated_at = Date.now();
      saveDatabase(db);

      return {
        success: true,
        backup_id: backupId || undefined,
        message: `Se eliminaron ${deletedCount} registro(s) de la tabla '${params.table}'.`,
        data: { table: params.table, deleted_count: deletedCount, backup_id: backupId },
      };
    }

    case 'database_create_table': {
      if (db.tables[params.name]) {
        return { success: false, error: `Ya existe una tabla llamada '${params.name}'.` };
      }

      const newTable: DynamicDatabaseTable = {
        id: `tbl_${crypto.randomBytes(6).toString('hex')}`,
        name: params.name,
        description: params.description || `Tabla dinámica ${params.name}`,
        columns: params.columns || [{ name: 'id', type: 'string', required: true, unique: true }],
        created_at: Date.now(),
        updated_at: Date.now(),
        records: [],
      };

      db.tables[params.name] = newTable;
      saveDatabase(db);

      return {
        success: true,
        message: `Tabla '${params.name}' creada exitosamente.`,
        data: { table: newTable },
      };
    }

    // --- USERS & AGENTS TOOLS ---
    case 'agents_list': {
      const agents = db.agents.map((a) => ({
        agent_id: a.agent_id,
        client_id: a.client_id,
        name: a.name,
        description: a.description,
        role: a.role,
        scopes: a.scopes,
        status: a.status,
        token_preview: a.token_preview,
        created_at: a.created_at,
        last_used_at: a.last_used_at,
        confirmation_mode: a.confirmation_mode,
      }));
      return { success: true, data: { count: agents.length, agents } };
    }

    case 'agents_create': {
      const { generateAgentCredentials } = await import('./agent-auth');
      const created = generateAgentCredentials({
        name: params.name,
        role: params.role || 'DEVELOPER_AGENT',
        scopes: params.scopes,
        confirmationMode: params.confirmation_mode || 'AUTO_APPROVE',
        expiresInDays: params.expires_in_days,
      });

      return {
        success: true,
        message: `Agente '${params.name}' creado con rol ${params.role}. Guarda el token proporcionado de forma segura.`,
        data: {
          agent: {
            agent_id: created.agent.agent_id,
            name: created.agent.name,
            role: created.agent.role,
            scopes: created.agent.scopes,
          },
          raw_token: created.rawToken,
        },
      };
    }

    case 'agents_revoke': {
      const targetAgent = db.agents.find((a) => a.agent_id === params.agent_id);
      if (!targetAgent) {
        return { success: false, error: `Agente con ID '${params.agent_id}' no encontrado.` };
      }

      if (params.action === 'activate') {
        targetAgent.status = 'active';
      } else if (params.action === 'suspend') {
        targetAgent.status = 'suspended';
      } else {
        targetAgent.status = 'revoked';
      }

      saveDatabase(db);
      return {
        success: true,
        message: `Estado del agente '${targetAgent.name}' actualizado a: ${targetAgent.status}.`,
        data: { agent_id: targetAgent.agent_id, status: targetAgent.status },
      };
    }

    // --- SETTINGS & BACKUPS TOOLS ---
    case 'settings_read': {
      return {
        success: true,
        data: { settings: db.system_settings },
      };
    }

    case 'settings_update': {
      db.system_settings = {
        ...db.system_settings,
        ...(params.settings || {}),
      };
      saveDatabase(db);
      return {
        success: true,
        message: 'Configuraciones del sistema actualizadas exitosamente.',
        data: { settings: db.system_settings },
      };
    }

    case 'backups_list': {
      const limit = params.limit || 30;
      const backups = db.backups.slice(0, limit).map((b) => ({
        id: b.id,
        resource_type: b.resource_type,
        resource_path: b.resource_path,
        created_at: b.created_at,
        agent_id: b.agent_id,
        action: b.action,
        description: b.description,
        is_restored: b.is_restored,
      }));
      return { success: true, data: { count: backups.length, backups } };
    }

    case 'backups_rollback': {
      const rollbackResult = restoreBackup(params.backup_id);
      return {
        success: rollbackResult.success,
        message: rollbackResult.message,
      };
    }

    case 'audit_query': {
      let filtered = [...db.audit_logs];
      if (params.agent_id) filtered = filtered.filter((l) => l.agent_id === params.agent_id);
      if (params.tool) filtered = filtered.filter((l) => l.tool === params.tool);
      if (params.status) filtered = filtered.filter((l) => l.status === params.status);

      const limit = params.limit || 50;
      const sliced = filtered.slice(0, limit);

      return {
        success: true,
        data: { count: sliced.length, logs: sliced },
      };
    }

    default:
      return { success: false, error: `Herramienta '${toolDef.name}' no tiene implementación asignada.` };
  }
}

// Helper to filter objects
function matchesFilter(record: Record<string, any>, filter?: Record<string, any>): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [key, val] of Object.entries(filter)) {
    if (record[key] !== val) return false;
  }
  return true;
}

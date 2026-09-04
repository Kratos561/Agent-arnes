/**
 * Claude Runtime — infraestructura agéntica estilo Claude Code adaptada al
 * cliente estático (navegador, sin servidor).
 *
 * Qué incluye (todo 100% local salvo las llamadas al proveedor):
 *   - Presupuesto de ejecución por turno (iteraciones, llamadas a tools, tiempo)
 *   - Manifiesto de herramientas + permisos allow/deny por herramienta
 *   - TODOs de sesión (crear, avanzar, completar) inyectados al prompt
 *   - Memoria de proyecto + notas de sesión inyectadas al prompt (con tope)
 *   - Plan explícito (proponer -> aprobar -> ejecutar) para tareas complejas
 *   - Checkpoints: foto de mensajes antes de cada turno + restaurar (undo)
 *   - Slash commands locales (/help, /plan, /todos, /memory, ...) sin API
 *   - Subagente de navegador: completion aislada con tools limitadas
 *   - Transcript estructurado de uso de herramientas por mensaje
 *
 * Lo que DELIBERADAMENTE no incluye (el export estático no puede):
 *   shell, filesystem, servidores, MCP remoto o browsing con credenciales.
 */

import type { ChatMessage, ToolTranscriptEvent } from './types';
import { createId } from './utils';

// ============================================================================
// Presupuesto de ejecución
// ============================================================================

export interface RunBudget {
  maxIterations: number;
  maxToolCalls: number;
  maxWallMs: number;
}

export const DEFAULT_RUN_BUDGET: RunBudget = {
  maxIterations: 5,
  maxToolCalls: 12,
  maxWallMs: 180_000,
};

export interface BudgetState {
  budget: RunBudget;
  startedAt: number;
  iterationsUsed: number;
  toolCallsUsed: number;
}

export function createBudgetState(budget: RunBudget = DEFAULT_RUN_BUDGET): BudgetState {
  return { budget, startedAt: Date.now(), iterationsUsed: 0, toolCallsUsed: 0 };
}

export function budgetAllowsTools(state: BudgetState): boolean {
  if (state.toolCallsUsed >= state.budget.maxToolCalls) return false;
  if (Date.now() - state.startedAt >= state.budget.maxWallMs) return false;
  return true;
}

export function budgetLimitNotice(state: BudgetState): string {
  if (state.toolCallsUsed >= state.budget.maxToolCalls) {
    return `[Límite de herramientas alcanzado (${state.budget.maxToolCalls}). Resume con lo obtenido y pide al usuario cómo seguir.]`;
  }
  return `[Límite de tiempo de turno alcanzado. Resume con lo obtenido y pide al usuario cómo seguir.]`;
}

// ============================================================================
// Manifiesto de herramientas + permisos
// ============================================================================

export type ToolSafety = 'read-only' | 'network' | 'export' | 'render';
export type PermissionMode = 'allow' | 'deny';

export interface ToolManifestEntry {
  name: string;
  description: string;
  /** Quién puede invocarla: el modelo vía API y/o el usuario vía Toolbench. */
  invokers: Array<'model' | 'user'>;
  safety: ToolSafety;
  defaultPermission: PermissionMode;
}

export const TOOL_MANIFEST: ToolManifestEntry[] = [
  { name: 'web_search', description: 'Búsqueda web (DuckDuckGo + Wikipedia). Requiere red.', invokers: ['model', 'user'], safety: 'network', defaultPermission: 'allow' },
  { name: 'render_chart', description: 'Genera especificación de gráfica para render local.', invokers: ['model'], safety: 'render', defaultPermission: 'allow' },
  { name: 'generate_csv', description: 'Genera datos tabulares descargables.', invokers: ['model'], safety: 'export', defaultPermission: 'allow' },
  { name: 'math', description: 'Evaluador matemático local seguro.', invokers: ['user'], safety: 'read-only', defaultPermission: 'allow' },
  { name: 'regex', description: 'Prueba expresiones regulares en local.', invokers: ['user'], safety: 'read-only', defaultPermission: 'allow' },
  { name: 'diff', description: 'Compara dos textos por líneas en local.', invokers: ['user'], safety: 'read-only', defaultPermission: 'allow' },
  { name: 'sql', description: 'Mini motor SQL en memoria (local).', invokers: ['user'], safety: 'read-only', defaultPermission: 'allow' },
  { name: 'jwt', description: 'Decodifica JWT en local (no verifica firma).', invokers: ['user'], safety: 'read-only', defaultPermission: 'allow' },
  { name: 'csv_json', description: 'Convierte CSV <-> JSON en local.', invokers: ['user'], safety: 'read-only', defaultPermission: 'allow' },
];

export type ToolPermissions = Record<string, PermissionMode>;

export function defaultPermissions(): ToolPermissions {
  const out: ToolPermissions = {};
  for (const t of TOOL_MANIFEST) out[t.name] = t.defaultPermission;
  return out;
}

export function isToolAllowed(name: string, permissions?: ToolPermissions | null): boolean {
  if (!permissions) return true;
  const mode = permissions[name];
  if (mode) return mode === 'allow';
  const manifest = TOOL_MANIFEST.find((t) => t.name === name);
  if (manifest) return manifest.defaultPermission === 'allow';
  // Desconocida: denegar por defecto (fail-closed honesto).
  return false;
}

export function summarizePermissionsForPrompt(permissions?: ToolPermissions | null): string {
  if (!permissions) return '';
  const denied = Object.entries(permissions).filter(([, m]) => m === 'deny').map(([n]) => n);
  if (denied.length === 0) return '';
  return `## Permisos de herramientas\nHerramientas denegadas por el usuario (NO las invoques, ofrece alternativa manual): ${denied.join(', ')}.`;
}

// ============================================================================
// TODOs de sesión
// ============================================================================

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface AgentTodo {
  id: string;
  text: string;
  status: TodoStatus;
  createdAt: number;
  updatedAt: number;
}

const TODO_TRANSITIONS: Record<TodoStatus, TodoStatus[]> = {
  pending: ['in_progress', 'completed'],
  in_progress: ['pending', 'completed'],
  completed: ['pending'],
};

export function createTodo(text: string): AgentTodo {
  const now = Date.now();
  return { id: createId('todo'), text: text.trim(), status: 'pending', createdAt: now, updatedAt: now };
}

export function setTodoStatus(todos: AgentTodo[], id: string, status: TodoStatus): AgentTodo[] {
  return todos.map((t) => {
    if (t.id !== id) return t;
    if (!TODO_TRANSITIONS[t.status].includes(status)) return t;
    // Solo un in_progress a la vez (disciplina estilo Claude Code).
    return { ...t, status, updatedAt: Date.now() };
  });
}

export function summarizeTodosForPrompt(todos: AgentTodo[]): string {
  const open = todos.filter((t) => t.status !== 'completed');
  if (open.length === 0) return '';
  const lines = open.slice(0, 12).map((t) => `- [${t.status === 'in_progress' ? '>' : ' '}] ${t.text}`);
  const extra = open.length > 12 ? `\n(+${open.length - 12} más)` : '';
  return `## TODOs activos de la sesión\nActualiza su estado a medida que avanzes (un in_progress a la vez):\n${lines.join('\n')}${extra}`;
}

// ============================================================================
// Memoria (proyecto + sesión)
// ============================================================================

export interface AgentMemory {
  project: string;
  session: string;
  updatedAt: number;
}

export const EMPTY_MEMORY: AgentMemory = { project: '', session: '', updatedAt: 0 };
const MEMORY_CHAR_CAP = 2000;

function capText(s: string, cap: number): string {
  const t = (s || '').trim();
  return t.length > cap ? `${t.slice(0, cap)}…` : t;
}

export function summarizeMemoryForPrompt(memory: AgentMemory | null | undefined): string {
  if (!memory) return '';
  const parts: string[] = [];
  const project = capText(memory.project, MEMORY_CHAR_CAP);
  const session = capText(memory.session, MEMORY_CHAR_CAP);
  if (project) parts.push(`### Memoria de proyecto\n${project}`);
  if (session) parts.push(`### Notas de sesión\n${session}`);
  if (parts.length === 0) return '';
  return `## Memoria persistente (respétala, no la repitas verbatim)\n${parts.join('\n\n')}`;
}

// ============================================================================
// Plan explícito
// ============================================================================

export type PlanStatus = 'none' | 'proposed' | 'approved' | 'executing' | 'done';

export interface AgentPlanStep {
  text: string;
  done: boolean;
}

export interface AgentPlan {
  goal: string;
  steps: AgentPlanStep[];
  status: PlanStatus;
  createdAt: number;
  updatedAt: number;
}

export const EMPTY_PLAN: AgentPlan = { goal: '', steps: [], status: 'none', createdAt: 0, updatedAt: 0 };

export function createPlan(goal: string, steps: string[]): AgentPlan {
  const now = Date.now();
  return {
    goal: goal.trim(),
    steps: steps.map((s) => ({ text: s.trim(), done: false })).filter((s) => s.text.length > 0).slice(0, 12),
    status: 'proposed',
    createdAt: now,
    updatedAt: now,
  };
}

export function summarizePlanForPrompt(plan: AgentPlan | null | undefined): string {
  if (!plan || plan.status === 'none' || !plan.goal) return '';
  const steps = plan.steps.map((s, i) => `${i + 1}. [${s.done ? 'x' : ' '}] ${s.text}`).join('\n');
  const gate =
    plan.status === 'proposed'
      ? 'ESTADO: propuesto, SIN aprobar. NO ejecutes todavía: presenta el plan y pide aprobación con /approve.'
      : plan.status === 'approved'
        ? 'ESTADO: aprobado. Puedes ejecutar paso a paso marcando avance.'
        : plan.status === 'executing'
          ? 'ESTADO: en ejecución. Sigue el plan y marca avance.'
          : 'ESTADO: terminado.';
  return `## Plan de trabajo\nObjetivo: ${plan.goal}\n${steps}\n${gate}`;
}

// ============================================================================
// Checkpoints (undo del último turno)
// ============================================================================

export interface AgentCheckpoint {
  sessionId: string;
  messages: ChatMessage[];
  createdAt: number;
  label: string;
}

export function createCheckpoint(sessionId: string, messages: ChatMessage[], label: string): AgentCheckpoint {
  return { sessionId, messages: messages.map((m) => ({ ...m })), createdAt: Date.now(), label };
}

// ============================================================================
// Transcript de herramientas
// ============================================================================

export function transcriptToText(events: ToolTranscriptEvent[]): string {
  if (events.length === 0) return '';
  return events
    .map((e) => {
      if (e.status === 'completed') return `✅ \`${e.toolName}\` completado (${Math.round(e.ms ?? 0)}ms)`;
      if (e.status === 'blocked') return `⛔ \`${e.toolName}\` bloqueado por permisos${e.note ? `: ${e.note}` : ''}`;
      if (e.status === 'failed') return `❌ \`${e.toolName}\` falló${e.note ? `: ${e.note}` : ''}`;
      return `⚙️ Ejecutando: \`${e.toolName}\`...`;
    })
    .join('\n');
}

// ============================================================================
// Slash commands (100% locales)
// ============================================================================

export interface SlashCommandDef {
  name: string;
  description: string;
  usage: string;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: '/help', description: 'Muestra los comandos disponibles.', usage: '/help' },
  { name: '/status', description: 'Estado del agente: TODOs, plan, memoria y permisos.', usage: '/status' },
  { name: '/plan', description: 'Propone un plan paso a paso (requiere /approve).', usage: '/plan objetivo | paso 1 | paso 2' },
  { name: '/approve', description: 'Aprueba el plan propuesto y permite ejecutarlo.', usage: '/approve' },
  { name: '/todos', description: 'Lista los TODOs de la sesión.', usage: '/todos' },
  { name: '/todo', description: 'Añade un TODO: /todo add texto | /todo done N | /todo start N.', usage: '/todo add <texto>' },
  { name: '/memory', description: 'Guarda nota: /memory project texto | /memory session texto | /memory show.', usage: '/memory session <texto>' },
  { name: '/permissions', description: 'Muestra o cambia permisos: /permissions | /permissions deny web_search.', usage: '/permissions [allow|deny] <tool>' },
  { name: '/subagent', description: 'Delega una investigación acotada al subagente (usa tu API).', usage: '/subagent <tarea>' },
  { name: '/compact', description: 'Pide al modelo un resumen para continuar ligero.', usage: '/compact' },
  { name: '/undo', description: 'Restaura los mensajes previos al último turno.', usage: '/undo' },
  { name: '/clear', description: 'Limpia los mensajes de la conversación actual.', usage: '/clear' },
  { name: '/export', description: 'Abre el diálogo de exportación.', usage: '/export' },
];

export interface ParsedSlash {
  name: string;
  args: string;
}

export function parseSlashCommand(input: string): ParsedSlash | null {
  const text = input.trim();
  if (!text.startsWith('/')) return null;
  const space = text.indexOf(' ');
  if (space === -1) return { name: text.toLowerCase(), args: '' };
  return { name: text.slice(0, space).toLowerCase(), args: text.slice(space + 1).trim() };
}

export function isKnownSlash(name: string): boolean {
  return SLASH_COMMANDS.some((c) => c.name === name);
}

// ============================================================================
// Subagente (delegación acotada, usa el mismo proveedor vía api-client)
// ============================================================================

export interface SubagentRequest {
  task: string;
  /** Mensajes recientes como contexto de solo-lectura (capados por el llamador). */
  context: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Tools permitidas para el subagente (por defecto solo web_search). */
  allowedTools: string[];
}

export function buildSubagentRequest(
  task: string,
  recentMessages: ChatMessage[],
  allowedTools: string[] = ['web_search']
): SubagentRequest {
  const context = recentMessages
    .filter((m) => !m.isError && m.content.trim())
    .slice(-6)
    .map((m) => ({ role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: m.content.slice(0, 1500) }));
  return { task: task.trim(), context, allowedTools };
}

export function buildSubagentSystemPrompt(req: SubagentRequest): string {
  return [
    'Eres un subagente de investigación con contexto aislado. Tu única misión:',
    req.task,
    '',
    'REGLAS ESTRICTAS:',
    '- Responde SOLO con el resultado de la subtarea, en Markdown conciso.',
    '- No pidas aclaraciones: trabaja con lo dado.',
    `- Herramientas permitidas: ${req.allowedTools.length > 0 ? req.allowedTools.join(', ') : '(ninguna)'}.`,
    '- No ejecutes pasos fuera de la subtarea.',
  ].join('\n');
}

/**
 * Agent Infrastructure — DeepSeek Harness-style prompt assembly.
 *
 * Implements ordered prompt sections, skills, rules, and persona system
 * following the DeepSeek Harness architecture:
 *   -100  Harness identity (fixed)
 *    -50  Runtime context (time, workspace)
 *     0   Deployment persona (configurable)
 *    50   Active skills (task-scoped instructions)
 *   100   User rules (AGENTS.md-style)
 *   150   Tool guidance (per-tool cross-call habits)
 *   200   Safety & compliance
 *
 * Skills follow the open Agent Skills standard (SKILL.md format):
 *   - YAML frontmatter: name, description, optional fields
 *   - Markdown body: instructions
 */

import { ProviderConfig } from './types';
import { ASK_PROTOCOL_INSTRUCTIONS } from './agent-protocol';

// ===== Types =====

export interface AgentRule {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  scope: 'global' | 'session';
  category: 'behavior' | 'output' | 'safety' | 'custom';
  createdAt: number;
  updatedAt: number;
}

/**
 * AgentSkill follows the Agent Skills open standard (SKILL.md).
 * name = directory name / command name
 * description = trigger routing logic (loaded in listing)
 * instructions = full SKILL.md body (loaded on invocation)
 */
export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  triggers: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PersonaConfig {
  id: string;
  name: string;
  text: string;
  isActive: boolean;
}

export interface PromptSection {
  name: string;
  order: number;
  text: string;
}

export interface AssembleContext {
  provider: ProviderConfig;
  modelId: string;
  customPrompt?: string;
  activeRules: AgentRule[];
  activeSkills: AgentSkill[];
  persona: PersonaConfig;
  sessionPrompt?: string;
}

// ===== SKILL.md Parser =====

/**
 * Parses a SKILL.md file (YAML frontmatter + Markdown body).
 * Format:
 *   ---
 *   name: skill-name
 *   description: When to use this skill...
 *   ---
 *   ## Instructions
 *   ...markdown content...
 */
export function parseSkillMd(raw: string): { frontmatter: Record<string, string>; body: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('---')) return null;

  const endFm = trimmed.indexOf('---', 3);
  if (endFm === -1) return null;

  const fmBlock = trimmed.slice(3, endFm).trim();
  const body = trimmed.slice(endFm + 3).trim();

  const frontmatter: Record<string, string> = {};
  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (key) frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

/**
 * Creates an AgentSkill from raw SKILL.md content.
 * Generates ID from name, extracts triggers from description.
 */
export function skillFromSkillMd(raw: string, existingId?: string): AgentSkill | null {
  const parsed = parseSkillMd(raw);
  if (!parsed) return null;

  const { frontmatter, body } = parsed;
  const name = frontmatter.name || 'unnamed';
  const description = frontmatter.description || body.slice(0, 120).replace(/\n/g, ' ');

  // Extract trigger phrases from description (lowercase words/phrases > 3 chars)
  const triggers = description
    .toLowerCase()
    .replace(/[^a-z0-9\sáéíóúñ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);

  return {
    id: existingId || `skill-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
    name,
    description,
    instructions: body,
    enabled: true,
    triggers,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Exports an AgentSkill to SKILL.md format.
 */
export function skillToSkillMd(skill: AgentSkill): string {
  const lines = [
    '---',
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    '---',
    '',
    skill.instructions,
  ];
  return lines.join('\n');
}

// ===== Default Rules =====

export const DEFAULT_RULES: AgentRule[] = [
  {
    id: 'rule-identity',
    name: 'Identidad del Agente',
    content: 'Eres un agente de IA altamente capaz, autónomo y proactivo. Tienes acceso a herramientas de navegador y puedes crear, analizar, transformar y ejecutar código en tiempo real. Operas con total libertad creativa dentro de los límites de seguridad establecidos.',
    enabled: true,
    scope: 'global',
    category: 'behavior',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'rule-reasoning',
    name: 'Razonamiento Profundo',
    content: 'Utiliza razonamiento en cadena (Chain of Thought) profundo para resolver problemas complejos. Descompón tareas en pasos lógicos, considera alternativas, evalúa trade-offs y presenta tu proceso de pensamiento de forma estructurada antes de dar una respuesta final.',
    enabled: true,
    scope: 'global',
    category: 'behavior',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'rule-output',
    name: 'Formato de Salida',
    content: 'Responde siempre con Markdown estructurado: encabezados jerárquicos (##, ###), listas organizadas, tablas formateadas, bloques de código con etiquetas de lenguaje, y notación LaTeX para fórmulas matemáticas ($...$ inline, $$...$$ display). Nunca generes fragmentos incompletos o con placeholders.',
    enabled: true,
    scope: 'global',
    category: 'output',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'rule-completeness',
    name: 'Respuestas Completas',
    content: 'Nunca cortes una respuesta prematuramente. Si la respuesta es larga, continúa naturalmente hasta completar el análisis. Si el modelo se queda sin tokens, utiliza la función de auto-continuación para retomar exactamente donde se quedó sin repetir contenido previo.',
    enabled: true,
    scope: 'global',
    category: 'output',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'rule-code',
    name: 'Generación de Código',
    content: 'Genera código completo, tipado y listo para producción. Incluye imports, tipos, manejo de errores y comentarios solo cuando aportan claridad. Prefiere TypeScript para backend, Python para data science, y el lenguaje más apropiado para cada tarea. Siempre incluye un bloque de código completo ejecutable.',
    enabled: true,
    scope: 'global',
    category: 'behavior',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'rule-error-recovery',
    name: 'Recuperación de Errores',
    content: 'Si una herramienta falla o devuelve un error inesperado: (1) Analiza la causa raíz del error. (2) Intenta una estrategia alternativa (ej: si web_search falla, reformula la query o usa conocimiento propio). (3) Si el error persiste, informa al usuario con contexto claro y sugiere pasos manuales. (4) NUNCA repitas exactamente la misma llamada a herramienta que falló — cambia el approach.',
    enabled: true,
    scope: 'global',
    category: 'behavior',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'rule-plan-mode',
    name: 'Modo Planificación',
    content: 'Para tareas complejas (más de 3 pasos o que involucran múltiples herramientas): (1) Antes de ejecutar, presenta un plan breve con los pasos que vas a seguir. (2) Espera a que el usuario confirme o ajuste el plan. (3) Ejecuta paso a paso, reportando progreso. Si el usuario pide "hazlo directamente" o la tarea es simple, ejecuta sin preguntar.',
    enabled: true,
    scope: 'global',
    category: 'behavior',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'rule-skill-check',
    name: 'Revisión de Skills y Herramientas',
    content: 'ANTES de cada tarea: (1) Revisa si hay skills activos que apliquen a la tarea. Si los hay, siguelas. (2) Si no hay skills, evalúa qué herramientas necesitas (web_search para datos actuales, render_chart para visualizaciones, generate_csv para datos tabulares). (3) Usa las herramientas mediante bloques :::tool con el formato correcto. (4) Si la tarea requiere crear un skill permanente, genera un SKILL.md con frontmatter YAML e instrucciones completas.',
    enabled: true,
    scope: 'global',
    category: 'behavior',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'rule-safety',
    name: 'Seguridad y Límites',
    content: 'No generes código malicioso, no accedas a información sensible sin autorización, no ejecutes acciones destructivas sin confirmación. Si una solicitud viola principios éticos o de seguridad, explica por qué y ofrece alternativas constructivas.',
    enabled: true,
    scope: 'global',
    category: 'safety',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// ===== Default Skills =====

export const DEFAULT_SKILLS: AgentSkill[] = [];

// ===== Default Personas =====

export const DEFAULT_PERSONAS: PersonaConfig[] = [
  {
    id: 'persona-general',
    name: 'Agente General',
    text: 'Eres un agente de IA versátil y altamente capaz. Combina conocimiento técnico profundo con comunicación clara y accionable. Adáptate al contexto del usuario y proporciona soluciones completas.',
    isActive: true,
  },
  {
    id: 'persona-coder',
    name: 'Ingeniero de Software',
    text: 'Eres un ingeniero de software senior con experiencia en arquitectura de sistemas, DevOps y desarrollo full-stack. Escribe código limpio, tipado y bien documentado. Siempre considera seguridad, rendimiento y mantenibilidad.',
    isActive: false,
  },
  {
    id: 'persona-analyst',
    name: 'Analista de Datos',
    text: 'Eres un analista de datos experto en estadística, machine learning y visualización. Transformas datos en insights accionables. Explicas hallazgos técnicos de forma accesible para audiencias no técnicas.',
    isActive: false,
  },
  {
    id: 'persona-writer',
    name: 'Redactor Profesional',
    text: 'Eres un redactor y editor profesional. Domina la prosa persuasiva, la narrativa de impacto y la comunicación ejecutiva. Tu tono es sofisticado pero accesible, libre de clichés.',
    isActive: false,
  },
  {
    id: 'persona-tutor',
    name: 'Tutor Experto',
    text: 'Eres un profesor paciente y didáctico. Explicas conceptos complejos usando analogías, ejemplos prácticos y preguntas guiadas. Fomentas el pensamiento crítico y la resolución independiente de problemas.',
    isActive: false,
  },
];

// ===== Prompt Assembly =====

/**
 * Assembles the complete system prompt following DeepSeek Harness ordering:
 *   -100  Identity → -50 Context → 0 Persona → 50 Skills → 100 Rules → 150 Tool guidance → 200 Safety
 */
export function assemblePrompt(ctx: AssembleContext): string {
  const sections: PromptSection[] = [];

  // -100: Harness Identity (fixed)
  sections.push({
    name: 'harness:identity',
    order: -100,
    text: `Eres un agente de IA alimentado por Agent Arnes — un entorno de ejecución agéntico de alto rendimiento con renderizado reactivo, herramientas de navegador y streaming en vivo.`,
  });

  // -50: Runtime Context
  const now = new Date();
  sections.push({
    name: 'runtime:context',
    order: -50,
    text: [
      `## Contexto de Ejecución`,
      `- Fecha/Hora actual: ${now.toLocaleString('es-ES')}`,
      `- Proveedor activo: ${ctx.provider.name}`,
      `- Modelo activo: ${ctx.modelId}`,
      `- Endpoint: ${ctx.provider.baseUrl}`,
    ].join('\n'),
  });

  // 0: Persona
  if (ctx.persona.text.trim()) {
    sections.push({
      name: 'deployment:persona',
      order: 0,
      text: ctx.persona.text,
    });
  }

  // 50: Active Skills
  const activeSkills = ctx.activeSkills.filter((s) => s.enabled);
  if (activeSkills.length > 0) {
    const skillsText = activeSkills
      .map((s) => `### ${s.name}\n${s.instructions}`)
      .join('\n\n');
    sections.push({
      name: 'skills:active',
      order: 50,
      text: `## Skills Activas\n\nEstas instrucciones de skills estan cargadas para esta sesion:\n\n${skillsText}`,
    });
  }

  // 100: User Rules
  const activeRules = ctx.activeRules.filter((r) => r.enabled);
  if (activeRules.length > 0) {
    const rulesText = activeRules.map((r) => `- **${r.name}**: ${r.content}`).join('\n');
    sections.push({
      name: 'rules:user',
      order: 100,
      text: `## Reglas del Agente\n\n${rulesText}`,
    });
  }

  // 150: Tool Guidance (streamlined — Claude Code style)
  sections.push({
    name: 'tool:guidance',
    order: 150,
    text: [
      '## Herramientas',
      '',
      'Para usar herramientas, emite bloques con este formato EXACTO:',
      '',
      '```',
      ':::tool',
      '{"name":"nombre","arguments":{"param":"valor"}}',
      ':::',
      '```',
      '',
      '**Disponibles:**',
      '- `web_search` — Busca en internet (DuckDuckGo + Wikipedia). Args: `{"query":"..."}`',
      '- `render_chart` — Gráfica canvas. Args: `{"type":"bar|line|pie|doughnut","labels":[...],"datasets":[{"label":"...","data":[...]}],"title":"..."}`',
      '- `generate_csv` — CSV descargable. Args: `{"data":[{"col":"val"}]}`',
      '',
      '**Reglas:**',
      '- SIEMPRE usa el formato :::tool ... ::: (nada de "Tool: web_search query: ...").',
      '- Puedes emitir varios bloques :::tool en una respuesta.',
      '- Los resultados se ejecutan automáticamente y se insertan en el chat.',
      '- Después de emitir los bloques, continua con tu respuesta normal.',
      '',
      '**Flujo para tareas con información:**',
      '1. Analiza qué datos necesitas.',
      '2. Si necesitas datos actuales → web_search.',
      '3. Si necesitas visualizar datos → render_chart.',
      '',
      '**Documentos:** El usuario puede exportar desde los botones del chat — no uses :::tool para documentos.',
    ].join('\n'),
  });

  // 200: Safety & Compliance
  sections.push({
    name: 'safety:compliance',
    order: 200,
    text: [
      '## Seguridad y Cumplimiento',
      '- No generes contenido malicioso, discriminatory o ilegal.',
      '- Respeta la privacidad: no solicites ni almacenes datos personales sensibles sin necesidad.',
      '- Si una solicitud es ambigua sobre permisos, pregunta al usuario antes de proceder.',
      '- Advierte sobre riesgos de seguridad cuando genieres código que maneje autenticación, datos sensibles o operaciones destructivas.',
    ].join('\n'),
  });

  // Sort by order and join
  sections.sort((a, b) => a.order - b.order);

  const parts = sections.map((s) => s.text.trim()).filter(Boolean);

  // Add Ask Protocol
  parts.push(ASK_PROTOCOL_INSTRUCTIONS);

  // Add custom user prompt last (highest authority)
  if (ctx.customPrompt?.trim()) {
    parts.push(`# INSTRUCCIONES PERSONALIZADAS DEL USUARIO:\n${ctx.customPrompt.trim()}`);
  }

  // Add session-specific prompt if different from global
  if (ctx.sessionPrompt?.trim() && ctx.sessionPrompt.trim() !== ctx.customPrompt?.trim()) {
    parts.push(`# CONTEXTO DE ESTA SESIÓN:\n${ctx.sessionPrompt.trim()}`);
  }

  return parts.join('\n\n');
}

/**
 * Detects which skills should be auto-activated based on user message content.
 */
export function detectMatchingSkills(
  userMessage: string,
  allSkills: AgentSkill[]
): AgentSkill[] {
  const lower = userMessage.toLowerCase();
  return allSkills.filter(
    (skill) =>
      skill.enabled &&
      skill.triggers.some((trigger) => lower.includes(trigger.toLowerCase()))
  );
}

/**
 * Generates a skill catalog summary for the system prompt.
 */
export function getSkillCatalog(skills: AgentSkill[]): string {
  const enabled = skills.filter((s) => s.enabled);
  if (enabled.length === 0) return '';
  return enabled.map((s) => `- **${s.name}**: ${s.description}`).join('\n');
}

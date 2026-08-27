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

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  icon: string;
  category: 'coding' | 'writing' | 'analysis' | 'creative' | 'custom';
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

export const DEFAULT_SKILLS: AgentSkill[] = [
  {
    id: 'skill-code-review',
    name: 'Code Review',
    description: 'Revision profunda de código con análisis de calidad, seguridad y rendimiento',
    instructions: `Cuando revises código, sigue este protocolo:
1. **Análisis Estructural**: Evalúa la arquitectura, separación de responsabilidades y patrones de diseño.
2. **Seguridad**: Identifica vulnerabilidades (XSS, SQL injection, secrets expuestos, dependencias vulnerables).
3. **Rendimiento**: Detecta cuellos de botella, operaciones innecesarias, uso excesivo de memoria.
4. **Legibilidad**: Evalúa naming, comentarios, complejidad ciclomática, funciones demasiado largas.
5. **Testing**: Sugiere casos de prueba faltantes y cobertura.
6. **Resumen**: Presenta hallazgos en tabla priorizada (Crítico > Mayor > Menor > Sugerencia).`,
    enabled: true,
    icon: '🔍',
    category: 'coding',
    triggers: ['revisar código', 'code review', 'audit', 'refactorizar', 'mejorar código'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'skill-api-design',
    name: 'Diseño de APIs',
    description: 'Diseña APIs REST/GraphQL robustas con documentación completa',
    instructions: `Al diseñar una API:
1. **Define el modelo de datos** con schemas TypeScript/Pydantic completos.
2. **Diseña los endpoints** siguiendo convenciones REST (resources, HTTP methods, status codes).
3. **Implementa autenticación** y autorización (JWT, API keys, OAuth).
4. **Documenta** con OpenAPI/Swagger ejemplo.
5. **Incluye validación** de entrada, rate limiting, y manejo de errores estructurado.
6. **Genera código** completo del servidor con testing unitario.`,
    enabled: true,
    icon: '🔌',
    category: 'coding',
    triggers: ['crear api', 'diseñar api', 'endpoint', 'rest api', 'graphql'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'skill-document-writer',
    name: 'Redactor de Documentos',
    description: 'Genera documentos profesionales, reportes y propuestas',
    instructions: `Al redactar documentos profesionales:
1. **Estructura**: Usa encabezados jerárquicos, resumen ejecutivo, secciones claras.
2. **Tono**: Profesional pero accesible, evita jerga innecesaria.
3. **Datos**: Incluye métricas, tablas comparativas, gráficos ASCII cuando sea relevante.
4. **Acciones**: Termina con recomendaciones concretas y próximos pasos.
5. **Formato**: Markdown limpio con tablas, listas y énfasis estratégico.`,
    enabled: true,
    icon: '📄',
    category: 'writing',
    triggers: ['escribir documento', 'reporte', 'propuesta', 'whitepaper', 'artículo'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'skill-data-analysis',
    name: 'Análisis de Datos',
    description: 'Analiza datasets, genera visualizaciones y extrae insights',
    instructions: `Al analizar datos:
1. **Exploración**: Describe la estructura, tipos, distribuciones y valores faltantes.
2. **Limpieza**: Identifica outliers, duplicados e inconsistencias.
3. **Análisis**: Estadísticas descriptivas, correlaciones, tendencias.
4. **Visualización**: Genera código Python (matplotlib/seaborn) o JavaScript (Chart.js) para gráficos.
5. **Insights**: Extrae conclusiones accionables con soporte estadístico.
6. **Entregable**: Código reproducible + resumen ejecutivo.`,
    enabled: true,
    icon: '📊',
    category: 'analysis',
    triggers: ['analizar datos', 'dataset', 'estadísticas', 'visualización', 'csv', 'json data'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'skill-creative-writing',
    name: 'Escritura Creativa',
    description: 'Genera contenido creativo, narrativas y guiones',
    instructions: `Al escribir de forma creativa:
1. **Voz**: Desarrolla una voz narrativa distintiva y consistente.
2. **Estructura**: Arco narrativo claro con conflicto, desarrollo y resolución.
3. **Diálogos**: Naturales, con subtexto y personalidad diferenciada.
4. **Descripciones**: Sensoriales, evocadoras, sin caer en clichés.
5. **Formato**: Puedes usar markdown para estructura creativa (actos, escenas, notas).`,
    enabled: true,
    icon: '✍️',
    category: 'creative',
    triggers: ['escribir historia', 'guion', 'poema', 'creative writing', 'narrativa'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'skill-system-design',
    name: 'Diseño de Sistemas',
    description: 'Arquitectura de software, diagramas y decisiones de diseño',
    instructions: `Al diseñar sistemas:
1. **Requisitos**: Clarifica funcionalidades, restricciones y escala esperada.
2. **Arquitectura**: Propón patrones apropiados (microservices, monolith, serverless, etc.).
3. **Componentes**: Define servicios, bases de datos, colas, cachés con justificación.
4. **Diagramas**: Genera diagramas en Mermaid o ASCII art.
5. **Trade-offs**: Analiza ventajas/desventajas de cada decisión.
6. **Roadmap**: Plan de implementación por fases con estimaciones.`,
    enabled: true,
    icon: '🏗️',
    category: 'coding',
    triggers: ['diseñar sistema', 'arquitectura', 'system design', 'diagrama', 'escalar'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

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
      .map((s) => `### ${s.icon} ${s.name}\n${s.instructions}`)
      .join('\n\n');
    sections.push({
      name: 'skills:active',
      order: 50,
      text: `## Skills Activas\n\nEstas instrucciones de skills están cargadas para esta sesión:\n\n${skillsText}`,
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

  // 150: Tool Guidance
  sections.push({
    name: 'tool:guidance',
    order: 150,
    text: [
      '## Directrices de Uso de Herramientas',
      '- Utiliza la suite de herramientas del navegador para ejecutar código, transformar datos y realizar cálculos.',
      '- Cuando generes código en bloques ```language, asegúrate de que sea completo y ejecutable.',
      '- Para tareas complejas, descompón el problema y ejecuta pasos secuenciales.',
      '- Si una herramienta falla, analiza el error y adapta tu enfoque.',
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
  return enabled.map((s) => `- ${s.icon} **${s.name}**: ${s.description}`).join('\n');
}

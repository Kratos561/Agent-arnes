import { ProviderConfig, ChatSession, ModelInfo, PRESET_PROVIDERS, VERIFIED_DEFAULT_MODELS, DEFAULT_PARAMETERS } from './types';
import { createId } from './utils';
import { AgentRule, AgentSkill, PersonaConfig, DEFAULT_RULES, DEFAULT_SKILLS, DEFAULT_PERSONAS } from './agent-infra';

const STORAGE_KEYS = {
  PROVIDERS: 'chat_providers_v1',
  ACTIVE_PROVIDER_ID: 'chat_active_provider_id_v1',
  ACTIVE_MODEL_ID: 'chat_active_model_id_v1',
  CACHED_MODELS_PREFIX: 'chat_models_cache_',
  SESSIONS: 'chat_sessions_v1',
  ACTIVE_SESSION_ID: 'chat_active_session_id_v1',
  SYSTEM_PROMPT: 'chat_system_prompt_v1',
  DARK_MODE: 'chat_dark_mode_v1',
  AGENT_RULES: 'chat_agent_rules_v1',
  AGENT_SKILLS: 'chat_agent_skills_v1',
  AGENT_PERSONAS: 'chat_agent_personas_v1',
  ACTIVE_PERSONA_ID: 'chat_active_persona_id_v1',
};

export const INITIAL_SESSION_ID = 'default_chat_session';

export function createInitialSession(): ChatSession {
  return {
    id: INITIAL_SESSION_ID,
    title: 'Nuevo Chat',
    createdAt: 0,
    updatedAt: 0,
    providerId: 'openrouter',
    modelId: 'openai/gpt-4o-mini',
    systemPrompt: '',
    messages: [],
    parameters: { ...DEFAULT_PARAMETERS },
  };
}

// --- Providers Storage ---
export function loadProviders(): ProviderConfig[] {
  if (typeof window === 'undefined') return PRESET_PROVIDERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROVIDERS);
    if (!raw) return PRESET_PROVIDERS;
    const parsed: ProviderConfig[] = JSON.parse(raw);
    
    // Merge with preset list so updated presets are included
    const merged = [...PRESET_PROVIDERS];
    for (const p of parsed) {
      const idx = merged.findIndex((m) => m.id === p.id);
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...p };
      } else {
        merged.push(p);
      }
    }
    return merged;
  } catch {
    return PRESET_PROVIDERS;
  }
}

export function saveProviders(providers: ProviderConfig[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEYS.PROVIDERS, JSON.stringify(providers));
    notifyAppStoreUpdate({ providers });
    return true;
  } catch (e) {
    console.error('Error saving providers to localStorage', e);
    return false;
  }
}

/** Comprueba si el almacenamiento local está disponible y escribible. */
export function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const k = '__arrow_check__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function loadActiveProviderId(): string {
  if (typeof window === 'undefined') return 'openrouter';
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_PROVIDER_ID) || 'openrouter';
}

export function saveActiveProviderId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_PROVIDER_ID, id);
  notifyAppStoreUpdate({ activeProviderId: id });
}

export function loadActiveModelId(): string {
  if (typeof window === 'undefined') return 'openai/gpt-4o-mini';
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_MODEL_ID) || 'openai/gpt-4o-mini';
}

export function saveActiveModelId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_MODEL_ID, id);
  notifyAppStoreUpdate({ activeModelId: id });
}

// --- Cached Models by Provider ---
export function loadCachedModels(providerId: string): ModelInfo[] {
  const verified = VERIFIED_DEFAULT_MODELS[providerId] || [];
  if (typeof window === 'undefined') return verified;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.CACHED_MODELS_PREFIX}${providerId}`);
    if (!raw) return verified;
    const parsed: ModelInfo[] = JSON.parse(raw);
    if (!parsed || parsed.length === 0) return verified;
    return parsed;
  } catch {
    return verified;
  }
}

export function saveCachedModels(providerId: string, models: ModelInfo[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_KEYS.CACHED_MODELS_PREFIX}${providerId}`, JSON.stringify(models));
  } catch (e) {
    console.error('Error saving models cache', e);
  }
}

// --- Chat Sessions Storage ---
export function loadSessions(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (!raw) return [];
    const parsed: ChatSession[] = JSON.parse(raw);
    return parsed.map((s) => ({
      ...s,
      parameters: {
        ...DEFAULT_PARAMETERS,
        ...(s.parameters || {}),
        max_tokens: Math.max(s.parameters?.max_tokens || 8192, 8192),
      },
    }));
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    notifyAppStoreUpdate({ sessions });
  } catch (e) {
    console.error('Error saving sessions', e);
  }
}

/**
 * Lightweight in-memory-only session update for streaming.
 * Skips the expensive localStorage.setItem + JSON.stringify on every chunk.
 * Only notifies React subscribers for live display. Call saveSessions() at
 * stream end to persist to disk.
 */
let _streamingRafId: number | null = null;
let _pendingSessions: ChatSession[] | null = null;

export function saveSessionsStreaming(sessions: ChatSession[]) {
  if (typeof window === 'undefined') return;
  _pendingSessions = sessions;
  // Update in-memory snapshot immediately for useSyncExternalStore
  notifyAppStoreUpdate({ sessions });
  // Deduplicate localStorage writes to one per animation frame (~60fps max)
  if (_streamingRafId === null) {
    _streamingRafId = requestAnimationFrame(() => {
      _streamingRafId = null;
      if (_pendingSessions) {
        try {
          localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(_pendingSessions));
        } catch (e) {
          console.error('Error saving streaming sessions', e);
        }
        _pendingSessions = null;
      }
    });
  }
}

/** Force-flush any pending streaming save to localStorage (call on stream done/error). */
export function flushStreamingSave() {
  if (_streamingRafId !== null) {
    cancelAnimationFrame(_streamingRafId);
    _streamingRafId = null;
  }
  if (_pendingSessions) {
    try {
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(_pendingSessions));
    } catch (e) {
      console.error('Error flushing streaming sessions', e);
    }
    _pendingSessions = null;
  }
}

export function loadActiveSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
}

export function saveActiveSessionId(id: string | null) {
  if (typeof window === 'undefined') return;
  if (id) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, id);
  } else {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
  }
  notifyAppStoreUpdate({ activeSessionId: id });
}

// --- Global System Prompt ---
export function loadGlobalSystemPrompt(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT) || '';
}

export function saveGlobalSystemPrompt(prompt: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, prompt);
  notifyAppStoreUpdate({ globalSystemPrompt: prompt });
}

// --- Agent Rules ---
export function loadAgentRules(): AgentRule[] {
  if (typeof window === 'undefined') return DEFAULT_RULES;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AGENT_RULES);
    if (!raw) return DEFAULT_RULES;
    const parsed: AgentRule[] = JSON.parse(raw);
    if (!parsed || parsed.length === 0) return DEFAULT_RULES;
    // Merge with defaults so new default rules are always present
    const merged = [...DEFAULT_RULES];
    for (const r of parsed) {
      const idx = merged.findIndex((m) => m.id === r.id);
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...r };
      } else {
        merged.push(r);
      }
    }
    return merged;
  } catch {
    return DEFAULT_RULES;
  }
}

export function saveAgentRules(rules: AgentRule[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.AGENT_RULES, JSON.stringify(rules));
    notifyAppStoreUpdate({ agentRules: rules });
  } catch (e) {
    console.error('Error saving agent rules', e);
  }
}

// --- Agent Skills ---
export function loadAgentSkills(): AgentSkill[] {
  if (typeof window === 'undefined') return DEFAULT_SKILLS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AGENT_SKILLS);
    if (!raw) return DEFAULT_SKILLS;
    const parsed: AgentSkill[] = JSON.parse(raw);
    if (!parsed || parsed.length === 0) return DEFAULT_SKILLS;
    return parsed;
  } catch {
    return DEFAULT_SKILLS;
  }
}

export function saveAgentSkills(skills: AgentSkill[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.AGENT_SKILLS, JSON.stringify(skills));
    notifyAppStoreUpdate({ agentSkills: skills });
  } catch (e) {
    console.error('Error saving agent skills', e);
  }
}

// --- Agent Personas ---
export function loadAgentPersonas(): PersonaConfig[] {
  if (typeof window === 'undefined') return DEFAULT_PERSONAS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AGENT_PERSONAS);
    if (!raw) return DEFAULT_PERSONAS;
    const parsed: PersonaConfig[] = JSON.parse(raw);
    if (!parsed || parsed.length === 0) return DEFAULT_PERSONAS;
    return parsed;
  } catch {
    return DEFAULT_PERSONAS;
  }
}

export function saveAgentPersonas(personas: PersonaConfig[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.AGENT_PERSONAS, JSON.stringify(personas));
    notifyAppStoreUpdate({ agentPersonas: personas });
  } catch (e) {
    console.error('Error saving agent personas', e);
  }
}

export function loadActivePersonaId(): string {
  if (typeof window === 'undefined') return 'persona-general';
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_PERSONA_ID) || 'persona-general';
}

export function saveActivePersonaId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_PERSONA_ID, id);
  notifyAppStoreUpdate({ activePersonaId: id });
}

// --- Create New Session ---
export function createNewSession(providerId: string, modelId: string, systemPrompt?: string): ChatSession {
  return {
    id: createId('chat'),
    title: 'Nuevo Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    providerId,
    modelId,
    systemPrompt: systemPrompt || '',
    messages: [],
    parameters: { ...DEFAULT_PARAMETERS },
  };
}

// --- App State Store for Hydration Safety ---
export interface AppStorageState {
  providers: ProviderConfig[];
  activeProviderId: string;
  activeModelId: string;
  cachedModels: ModelInfo[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  globalSystemPrompt: string;
  agentRules: AgentRule[];
  agentSkills: AgentSkill[];
  agentPersonas: PersonaConfig[];
  activePersonaId: string;
}

const SERVER_SNAPSHOT: AppStorageState = {
  providers: PRESET_PROVIDERS,
  activeProviderId: 'openrouter',
  activeModelId: 'openai/gpt-4o-mini',
  cachedModels: VERIFIED_DEFAULT_MODELS.openrouter || [],
  sessions: [createInitialSession()],
  activeSessionId: INITIAL_SESSION_ID,
  globalSystemPrompt: '',
  agentRules: DEFAULT_RULES,
  agentSkills: DEFAULT_SKILLS,
  agentPersonas: DEFAULT_PERSONAS,
  activePersonaId: 'persona-general',
};

let clientSnapshot: AppStorageState = SERVER_SNAPSHOT;
let isClientInitialized = false;
let listeners: Array<() => void> = [];

export function subscribeAppStore(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function notifyAppStoreUpdate(partial: Partial<AppStorageState>) {
  clientSnapshot = {
    ...clientSnapshot,
    ...partial,
  };
  for (const listener of listeners) {
    listener();
  }
}

export function getAppStoreSnapshot(): AppStorageState {
  if (typeof window === 'undefined') {
    return SERVER_SNAPSHOT;
  }
  if (!isClientInitialized) {
    isClientInitialized = true;
    const loadedProviders = loadProviders();
    const storedProviderId = loadActiveProviderId();
    const loadedProviderId = loadedProviders.some((provider) => provider.id === storedProviderId)
      ? storedProviderId
      : PRESET_PROVIDERS[0].id;
    const storedModelId = loadActiveModelId();
    const loadedModelId = storedModelId || PRESET_PROVIDERS[0].defaultModel || '';
    const loadedCachedModels = loadCachedModels(loadedProviderId);
    let loadedSessions = loadSessions();
    let loadedActiveSessionId = loadActiveSessionId();

    if (loadedSessions.length === 0) {
      const initial = createNewSession(loadedProviderId, loadedModelId, loadGlobalSystemPrompt());
      loadedSessions = [initial];
      loadedActiveSessionId = initial.id;
      saveSessions(loadedSessions);
      saveActiveSessionId(initial.id);
    } else if (!loadedActiveSessionId || !loadedSessions.some((s) => s.id === loadedActiveSessionId)) {
      loadedActiveSessionId = loadedSessions[0]?.id || null;
      saveActiveSessionId(loadedActiveSessionId);
    }

    if (loadedProviderId !== storedProviderId) saveActiveProviderId(loadedProviderId);
    if (!storedModelId) saveActiveModelId(loadedModelId);
    clientSnapshot = {
      providers: loadedProviders,
      activeProviderId: loadedProviderId,
      activeModelId: loadedModelId,
      cachedModels: loadedCachedModels,
      sessions: loadedSessions,
      activeSessionId: loadedActiveSessionId,
      globalSystemPrompt: loadGlobalSystemPrompt(),
      agentRules: loadAgentRules(),
      agentSkills: loadAgentSkills(),
      agentPersonas: loadAgentPersonas(),
      activePersonaId: loadActivePersonaId(),
    };
  }
  return clientSnapshot;
}

export function getAppStoreServerSnapshot(): AppStorageState {
  return SERVER_SNAPSHOT;
}

// --- Export Conversation Helpers ---
export function exportSessionToMarkdown(session: ChatSession): string {
  let md = `# ${session.title}\n\n`;
  md += `*Fecha: ${session.createdAt ? new Date(session.createdAt).toLocaleString() : 'N/A'}*\n`;
  md += `*Modelo: ${session.modelId} (Proveedor: ${session.providerId})*\n\n---\n\n`;

  if (session.systemPrompt) {
    md += `> **System Prompt:**\n> ${session.systemPrompt.replace(/\n/g, '\n> ')}\n\n---\n\n`;
  }

  for (const m of session.messages) {
    const roleName = m.role === 'user' ? '👤 Usuario' : m.role === 'assistant' ? '🤖 Asistente' : '⚙️ Sistema';
    md += `### ${roleName} (${m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ''})\n\n`;
    if (m.reasoning_content) {
      md += `<details><summary>Pensamiento del modelo</summary>\n\n${m.reasoning_content}\n\n</details>\n\n`;
    }
    md += `${m.content}\n\n---\n\n`;
  }

  return md;
}

export function exportSessionToJSON(session: ChatSession): string {
  return JSON.stringify(session, null, 2);
}

'use client';


import React, { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  Menu,
  Plus,
  Sliders,
  Wand2,
  Share2,
  Trash2,
  Settings,
  Wrench,
  Shield,
  Sparkles,
  LogOut,
  Undo2,
  ListTodo,
} from 'lucide-react';
import {
  ProviderConfig,
  ModelInfo,
  ChatSession,
  ChatMessage,
  ModelParameters,
  DEFAULT_PARAMETERS,
  AskPayload,
  ToolTranscriptEvent,
} from '@/lib/types';
import {
  AgentTodo,
  buildSubagentRequest,
  buildSubagentSystemPrompt,
  createCheckpoint,
  createPlan,
  createTodo,
  isKnownSlash,
  isToolAllowed,
  parseSlashCommand,
  setTodoStatus,
  SLASH_COMMANDS,
  transcriptToText,
} from '@/lib/claude-runtime';
import { setToolPermissionChecker } from '@/lib/native-tools';
import { 
  subscribeAppStore,
  getAppStoreSnapshot,
  getAppStoreServerSnapshot,
  saveProviders, 
  saveActiveProviderId, 
  saveActiveModelId, 
  loadCachedModels, 
  saveCachedModels, 
  saveSessions, 
  saveSessionsStreaming,
  flushStreamingSave,
  saveActiveSessionId, 
  saveGlobalSystemPrompt,
  saveAgentRules,
  saveAgentSkills,
  saveAgentPersonas,
  saveActivePersonaId,
  saveToolPermissions,
  saveTodosBySession,
  saveAgentMemory,
  savePlansBySession,
  saveCheckpoint,
  createNewSession
} from '@/lib/storage';
import { createId, getCurrentTimestamp } from '@/lib/utils';
import { requestSingleCompletion, sendChatMessageStream } from '@/lib/api-client';
import { parseAskBlocks } from '@/lib/agent-protocol';
import { windowSizeForContextLength } from '@/lib/compaction';
import { estimateTokenCount } from '@/lib/context-manager';
import { Sidebar } from '@/components/Sidebar';
import { ModelDropdown } from '@/components/ModelDropdown';
import { ChatMessageItem } from '@/components/ChatMessageItem';
import { ChatInput } from '@/components/ChatInput';
import { EmptyState } from '@/components/EmptyState';
import { SettingsModal } from '@/components/SettingsModal';
import { ParametersModal } from '@/components/ParametersModal';
import { SystemPromptModal } from '@/components/SystemPromptModal';
import { ExportModal } from '@/components/ExportModal';
import { ToolsModal } from '@/components/ToolsModal';
import { RulesModal } from '@/components/RulesModal';
import { SkillsModal } from '@/components/SkillsModal';
import { SafeErrorBoundary } from '@/components/SafeErrorBoundary';
import { AuthScreen } from '@/components/AuthScreen';
import { getLocalSession, clearLocalSession } from '@/lib/auth-config';

export default function Home() {
  // Auth state
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    const session = getLocalSession();
    if (session) {
      setAuthEmail(session.email);
    }
    setAuthChecked(true);
  }, []);
  // Hydration-safe reactive store from LocalStorage
  const appState = useSyncExternalStore(
    subscribeAppStore,
    getAppStoreSnapshot,
    getAppStoreServerSnapshot
  );

  const {
    providers,
    activeProviderId,
    activeModelId,
    cachedModels,
    sessions,
    activeSessionId,
    globalSystemPrompt,
    agentRules,
    agentSkills,
    agentPersonas,
    activePersonaId,
    toolPermissions,
    todosBySession,
    memory,
    plansBySession,
    checkpoint,
  } = appState;

  // Enforce tool permissions en llamadas autónomas del modelo (fail-closed).
  useEffect(() => {
    setToolPermissionChecker((name) => isToolAllowed(name, getAppStoreSnapshot().toolPermissions));
    return () => setToolPermissionChecker(null);
  }, []);

  const [cachedModelsOverride, setCachedModelsOverride] = useState<ModelInfo[] | null>(null);
  const activeCachedModels = cachedModelsOverride !== null ? cachedModelsOverride : cachedModels;

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isParametersOpen, setIsParametersOpen] = useState(false);
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isSkillsOpen, setIsSkillsOpen] = useState(false);

  // Active persona derived from storage
  const activePersona = useMemo(() => {
    return agentPersonas?.find((p) => p.id === activePersonaId) || null;
  }, [agentPersonas, activePersonaId]);

  // Claude runtime: TODOs y plan de la sesión activa + snapshot para el prompt
  const activeSessionForRuntime = sessions.find((s) => s.id === activeSessionId) || null;
  const activeTodos: AgentTodo[] = useMemo(() => {
    if (!activeSessionForRuntime) return [];
    return todosBySession?.[activeSessionForRuntime.id] || [];
  }, [todosBySession, activeSessionForRuntime?.id]);
  const activePlan = useMemo(() => {
    if (!activeSessionForRuntime) return null;
    return plansBySession?.[activeSessionForRuntime.id] || null;
  }, [plansBySession, activeSessionForRuntime?.id]);
  const openTodoCount = activeTodos.filter((t) => t.status !== 'completed').length;

  const runtimeSnapshot = useMemo(() => ({
    todos: activeTodos,
    memory,
    plan: activePlan,
    toolPermissions,
  }), [activeTodos, memory, activePlan, toolPermissions]);
  
  // Streaming state
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync theme on mount — el modo oscuro es el DEFAULT (salvo que el usuario
  // haya guardado explícitamente una preferencia en localStorage)
  useEffect(() => {
    const savedDark = localStorage.getItem('chat_dark_mode_v1');
    const darkModeActive = savedDark !== null ? savedDark === 'true' : true;
    setIsDarkMode(darkModeActive);
    if (darkModeActive) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Abortar cualquier stream en curso al desmontar (evita fugas de fetch en background)
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      flushStreamingSave();
    };
  }, []);

  // Sync dark mode class
  const handleToggleDarkMode = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    localStorage.setItem('chat_dark_mode_v1', String(nextDark));
    if (nextDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Current Active Provider & Session
  const activeProvider = providers.find((p) => p.id === activeProviderId) || providers[0];
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || null;

  // Auto-scroll to bottom of chat when messages change
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  }, []);

  const messageCount = activeSession?.messages?.length || 0;

  useEffect(() => {
    if (messageCount > 0) {
      scrollToBottom('smooth');
    }
  }, [messageCount, isGenerating, scrollToBottom]);

  // Handler: New Chat
  const handleNewChat = useCallback(() => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
    flushStreamingSave();

    const currentSessions = getAppStoreSnapshot().sessions;
    const newSess = createNewSession(activeProviderId, activeModelId, globalSystemPrompt);
    const updated = [newSess, ...currentSessions];
    saveSessions(updated);
    saveActiveSessionId(newSess.id);
  }, [activeProviderId, activeModelId, globalSystemPrompt, isGenerating]);

  // Keyboard shortcut listener (Ctrl+N for new chat)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat]);

  // Handler: Change active provider
  const handleSelectActiveProvider = (providerId: string) => {
    saveActiveProviderId(providerId);

    const provider = providers.find((p) => p.id === providerId);
    if (provider?.defaultModel) {
      saveActiveModelId(provider.defaultModel);
    }

    const models = loadCachedModels(providerId);
    setCachedModelsOverride(models);

    // If active session exists, update its provider
    if (activeSessionId) {
      const now = getCurrentTimestamp();
      const currentSessions = getAppStoreSnapshot().sessions;
      const updated = currentSessions.map((s) => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            providerId,
            modelId: provider?.defaultModel || activeModelId,
            updatedAt: now,
          };
        }
        return s;
      });
      saveSessions(updated);
    }
  };

  // Handler: Change active model
  const handleSelectActiveModel = (modelId: string) => {
    saveActiveModelId(modelId);

    // Update active provider's default model
    const updatedProviders = providers.map((p) => {
      if (p.id === activeProviderId) {
        return { ...p, defaultModel: modelId };
      }
      return p;
    });
    saveProviders(updatedProviders);

    // If active session exists, update its model
    if (activeSessionId) {
      const now = getCurrentTimestamp();
      const currentSessions = getAppStoreSnapshot().sessions;
      const updated = currentSessions.map((s) => {
        if (s.id === activeSessionId) {
          return { ...s, modelId, updatedAt: now };
        }
        return s;
      });
      saveSessions(updated);
    }
  };

  // Handler: Select chat session
  const handleSelectSession = (id: string) => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
    saveActiveSessionId(id);

    const currentSessions = getAppStoreSnapshot().sessions;
    const targetSession = currentSessions.find((s) => s.id === id);
    if (targetSession) {
      if (targetSession.providerId && targetSession.providerId !== activeProviderId) {
        saveActiveProviderId(targetSession.providerId);
        setCachedModelsOverride(loadCachedModels(targetSession.providerId));
      }
      if (targetSession.modelId && targetSession.modelId !== activeModelId) {
        saveActiveModelId(targetSession.modelId);
      }
    }
  };

  // Handler: Delete session
  const handleDeleteSession = (id: string) => {
    const currentSessions = getAppStoreSnapshot().sessions;
    const remaining = currentSessions.filter((s) => s.id !== id);
    saveSessions(remaining);

    if (activeSessionId === id) {
      if (remaining.length > 0) {
        saveActiveSessionId(remaining[0].id);
      } else {
        const newSess = createNewSession(activeProviderId, activeModelId, globalSystemPrompt);
        saveSessions([newSess]);
        saveActiveSessionId(newSess.id);
      }
    }
  };

  // Handler: Rename session
  const handleRenameSession = (id: string, newTitle: string) => {
    const now = getCurrentTimestamp();
    const currentSessions = getAppStoreSnapshot().sessions;
    const updated = currentSessions.map((s) => {
      if (s.id === id) {
        return { ...s, title: newTitle, updatedAt: now };
      }
      return s;
    });
    saveSessions(updated);
  };

  // Handler: Pin session
  const handlePinSession = (id: string) => {
    const now = getCurrentTimestamp();
    const currentSessions = getAppStoreSnapshot().sessions;
    const updated = currentSessions.map((s) => {
      if (s.id === id) {
        return { ...s, isPinned: !s.isPinned, updatedAt: now };
      }
      return s;
    });
    saveSessions(updated);
  };

  // Handler: Clear current session messages
  const handleClearCurrentSession = () => {
    if (!activeSessionId) return;
    const now = getCurrentTimestamp();
    const currentSessions = getAppStoreSnapshot().sessions;
    const updated = currentSessions.map((s) => {
      if (s.id === activeSessionId) {
        return { ...s, messages: [], updatedAt: now };
      }
      return s;
    });
    saveSessions(updated);
  };

  // Handler: Clear all sessions
  const handleClearAllSessions = () => {
    if (confirm('¿Estás seguro de que deseas borrar todo el historial de chats?')) {
      const newSess = createNewSession(activeProviderId, activeModelId, globalSystemPrompt);
      saveSessions([newSess]);
      saveActiveSessionId(newSess.id);
    }
  };

  // Handler: Update parameters
  const handleUpdateParameters = (newParams: ModelParameters) => {
    if (!activeSessionId) return;
    const now = getCurrentTimestamp();
    const currentSessions = getAppStoreSnapshot().sessions;
    const updated = currentSessions.map((s) => {
      if (s.id === activeSessionId) {
        return { ...s, parameters: newParams, updatedAt: now };
      }
      return s;
    });
    saveSessions(updated);
  };

  // Handler: Update system prompt
  const handleSaveSystemPrompt = (newPrompt: string) => {
    saveGlobalSystemPrompt(newPrompt);

    if (activeSessionId) {
      const now = getCurrentTimestamp();
      const currentSessions = getAppStoreSnapshot().sessions;
      const updated = currentSessions.map((s) => {
        if (s.id === activeSessionId) {
          return { ...s, systemPrompt: newPrompt, updatedAt: now };
        }
        return s;
      });
      saveSessions(updated);
    }
  };

  // Core generation runner: añade mensaje de usuario, streamea la respuesta y parsea bloques ask
  const runGeneration = useCallback(
    async (userContent: string, contextMessages: ChatMessage[], targetSessionId?: string, sessionOverride?: ChatSession) => {
      if (!userContent.trim() || !activeSession || isGenerating) return;

      const ver = sessionOverride || activeSession;
      const needsKey = !activeProvider.apiKey;
      if (needsKey) {
        setIsSettingsOpen(true);
        return;
      }

      const currentTimestamp = getCurrentTimestamp();
      const sessionId = targetSessionId || activeSession.id;

      // Ventana de contexto del modelo activo (para la compactación del historial)
      const activeModelInfo = activeCachedModels.find((m) => m.id === activeModelId);
      const contextWindow = windowSizeForContextLength(activeModelInfo?.context_length);

      // Checkpoint estilo Claude Code: foto previa al turno para /undo (best-effort).
      try {
        saveCheckpoint(createCheckpoint(sessionId, [...contextMessages], userContent.slice(0, 80)));
      } catch { /* no bloquea el turno */ }

      const userMessage: ChatMessage = {
        id: createId('msg_u'),
        role: 'user',
        content: userContent,
        timestamp: currentTimestamp,
      };

      const assistantMessageId = createId('msg_a');
      const initialAssistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        reasoning_content: '',
        timestamp: currentTimestamp,
        model: activeModelId,
      };

      // Auto generate title on first user message
      const words = userContent.trim().split(/\s+/).slice(0, 6).join(' ');
      const sessionTitle = words.length > 36 ? `${words.slice(0, 36)}...` : words;

      const updatedMessages = [...contextMessages, userMessage, initialAssistantMessage];

      // Update session state
      const currentSessions = getAppStoreSnapshot().sessions;
      const intermediateSessions = currentSessions.map((s) => {
        if (s.id === sessionId) {
          return {
            ...s,
            title: contextMessages.length === 0 ? sessionTitle : s.title,
            messages: updatedMessages,
            updatedAt: currentTimestamp,
          };
        }
        return s;
      });
      saveSessions(intermediateSessions);

      setIsGenerating(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      let accumulatedContent = '';
      let accumulatedReasoning = '';
      const transcript: ToolTranscriptEvent[] = [];

      await sendChatMessageStream(
        activeProvider,
        activeModelId,
        [...contextMessages, userMessage],
        ver.parameters || DEFAULT_PARAMETERS,
        ver.systemPrompt || globalSystemPrompt,
        {
          onChunk: (chunk) => {
            accumulatedContent += chunk;
            // Strip tool call artifacts during streaming for cleaner display
            const displayContent = accumulatedContent
              .replace(/:::tool[\t ]*\n\{[\s\S]*?\}\n:::/g, '')
              .replace(/Tool call quote block:\s*/gi, '')
              .replace(/\*\*Tool call quote block:\*\*\s*/gi, '')
              .replace(/(?:^|\n)\s*(?:Tool|Herramienta):\s*\w+\s+\w+:[^\n]*(?:\n\s*\w+:[^\n]*)*/gi, '')
              .trim();
            const liveSessions = getAppStoreSnapshot().sessions;
            const liveUpdated = liveSessions.map((s) => {
              if (s.id === sessionId) {
                const msgs = s.messages.map((m) => {
                  if (m.id === assistantMessageId) {
                    return { ...m, content: displayContent };
                  }
                  return m;
                });
                return { ...s, messages: msgs };
              }
              return s;
            });
            saveSessionsStreaming(liveUpdated);
          },
          onReasoning: (reasoningChunk) => {
            accumulatedReasoning += reasoningChunk;
            const liveSessions = getAppStoreSnapshot().sessions;
            const liveUpdated = liveSessions.map((s) => {
              if (s.id === sessionId) {
                const msgs = s.messages.map((m) => {
                  if (m.id === assistantMessageId) {
                    return { ...m, reasoning_content: accumulatedReasoning };
                  }
                  return m;
                });
                return { ...s, messages: msgs };
              }
              return s;
            });
            saveSessionsStreaming(liveUpdated);
          },
          onToolCall: (call) => {
            transcript.push({ toolName: call.name, callId: call.id, status: 'started' });
            // Append tool call indicator as plain text (not blockquote, StreamRenderer strips those)
            const toolIndicator = `\n\n⚙️ Ejecutando: \`${call.name}\`...\n`;
            accumulatedContent += toolIndicator;
            const liveSessions = getAppStoreSnapshot().sessions;
            const liveUpdated = liveSessions.map((s) => {
              if (s.id === sessionId) {
                const msgs = s.messages.map((m) => {
                  if (m.id === assistantMessageId) {
                    return { ...m, content: accumulatedContent };
                  }
                  return m;
                });
                return { ...s, messages: msgs };
              }
              return s;
            });
            saveSessionsStreaming(liveUpdated);
          },
          onToolResult: (result) => {
            transcript.push({
              toolName: result.name,
              callId: result.callId,
              status: result.blocked ? 'blocked' : result.success ? 'completed' : 'failed',
              ms: result.executionTimeMs,
              note: result.blocked ? 'denegado por permisos' : undefined,
            });
            // Replace the "executing" indicator with the result
            const resultIndicator = result.blocked
              ? `\n⛔ \`${result.name}\` bloqueado por permisos\n`
              : `\n✅ \`${result.name}\` completado (${Math.round(result.executionTimeMs)}ms)\n`;
            accumulatedContent += resultIndicator;
            const liveSessions = getAppStoreSnapshot().sessions;
            const liveUpdated = liveSessions.map((s) => {
              if (s.id === sessionId) {
                const msgs = s.messages.map((m) => {
                  if (m.id === assistantMessageId) {
                    return { ...m, content: accumulatedContent };
                  }
                  return m;
                });
                return { ...s, messages: msgs };
              }
              return s;
            });
            saveSessionsStreaming(liveUpdated);
          },
          onDone: async (finalContent, finalReasoning, tokens, finishReason) => {
            setIsGenerating(false);
            abortControllerRef.current = null;
            flushStreamingSave();
            const doneTimestamp = getCurrentTimestamp();
            let combined = finalContent || accumulatedContent;

            // Pre-clean: remove visible tool call artifacts
            combined = combined
              .replace(/Tool call quote block:\s*/gi, '')
              .replace(/\*\*Tool call quote block:\*\*\s*/gi, '')
              // Strip any residual :::tool blocks (agentic loop in api-client already processed them)
              .replace(/:::tool[\t ]*\n\{[\s\S]*?\}\n:::/g, '')
              .replace(/(?:^|\n)\s*(?:Tool|Herramienta):\s*\w+\s+\w+:[^\n]*(?:\n\s*\w+:[^\n]*)*/gi, '')
              .trim();

            // Parsear bloques "ask" del modelo: separar el texto visible de las preguntas pendientes
            const { asks, text: visibleContent } = parseAskBlocks(combined);
            const pendingAsks = asks.length > 0 ? asks : undefined;

            const liveSessions = getAppStoreSnapshot().sessions;
            const newSessions = liveSessions.map((s) => {
              if (s.id === sessionId) {
                const msgs = s.messages.map((m) => {
                  if (m.id === assistantMessageId) {
                    return {
                      ...m,
                      content: visibleContent,
                      reasoning_content: finalReasoning || accumulatedReasoning,
                      tokens,
                      finish_reason: finishReason,
                      asks: pendingAsks,
                      askAnswered: pendingAsks ? false : undefined,
                      toolTranscript: transcript.length > 0 ? [...transcript] : undefined,
                    };
                  }
                  return m;
                });
                return { ...s, messages: msgs, updatedAt: doneTimestamp };
              }
              return s;
            });
            saveSessions(newSessions);
          },
          onError: (errMessage) => {
            setIsGenerating(false);
            abortControllerRef.current = null;
            flushStreamingSave();
            const errTimestamp = getCurrentTimestamp();
            const liveSessions = getAppStoreSnapshot().sessions;
            const newSessions = liveSessions.map((s) => {
              if (s.id === sessionId) {
                const msgs = s.messages.map((m) => {
                  if (m.id === assistantMessageId) {
                    return {
                      ...m,
                      content: errMessage,
                      isError: true,
                    };
                  }
                  return m;
                });
                return { ...s, messages: msgs, updatedAt: errTimestamp };
              }
              return s;
            });
            saveSessions(newSessions);
          },
        },
        controller.signal,
        contextWindow,
        agentRules,
        agentSkills,
        activePersona || undefined,
        undefined,
        runtimeSnapshot,
      );
    },
    [activeProvider, activeModelId, activeSession, globalSystemPrompt, isGenerating, activeCachedModels, agentRules, agentSkills, activePersona, runtimeSnapshot]
  );

  // Helper: turno local sin API (respuestas de slash commands)
  const appendLocalTurn = useCallback((sessionId: string, userContent: string, assistantContent: string, isError = false) => {
    const now = getCurrentTimestamp();
    const currentSessions = getAppStoreSnapshot().sessions;
    const updated = currentSessions.map((s) => {
      if (s.id !== sessionId) return s;
      return {
        ...s,
        messages: [
          ...s.messages,
          { id: createId('msg_u'), role: 'user', content: userContent, timestamp: now } as ChatMessage,
          { id: createId('msg_a'), role: 'assistant', content: assistantContent, timestamp: now, model: activeModelId, isError: isError || undefined } as ChatMessage,
        ],
        updatedAt: now,
      };
    });
    saveSessions(updated);
  }, [activeModelId]);

  // Ejecutor de slash commands (100% local salvo /subagent y /compact que usan tu API)
  const runSlashCommand = useCallback(
    async (raw: string): Promise<boolean> => {
      const parsed = parseSlashCommand(raw);
      if (!parsed || !activeSession) return false;
      const sessionId = activeSession.id;
      const store = getAppStoreSnapshot();
      const sessionTodos = store.todosBySession?.[sessionId] || [];
      const sessionPlan = store.plansBySession?.[sessionId] || null;

      const saveTodos = (next: typeof sessionTodos) => {
        saveTodosBySession({ ...(store.todosBySession || {}), [sessionId]: next });
      };

      switch (parsed.name) {
        case '/help': {
          const lines = SLASH_COMMANDS.map((c) => `- \`${c.usage}\` — ${c.description}`);
          appendLocalTurn(sessionId, raw, `## Comandos del agente\n\n${lines.join('\n')}\n\nTodo se ejecuta en tu navegador salvo /subagent y /compact, que usan tu API configurada.`);
          return true;
        }
        case '/status': {
          const open = sessionTodos.filter((t) => t.status !== 'completed');
          const done = sessionTodos.length - open.length;
          const denied = Object.entries(store.toolPermissions || {}).filter(([, m]) => m === 'deny').map(([n]) => n);
          const lastAssistant = [...(store.sessions.find((s) => s.id === sessionId)?.messages || [])].reverse().find((m) => m.role === 'assistant');
          const lastTranscript = lastAssistant?.toolTranscript?.length ? transcriptToText(lastAssistant.toolTranscript) : '';
          const lastTools = lastTranscript ? `\nÚltimo turno:\n${lastTranscript}` : '';
          appendLocalTurn(
            sessionId,
            raw,
            `## Estado del agente\n\n- TODOs: ${open.length} abiertos, ${done} completados\n- Plan: ${sessionPlan?.status || 'none'}${sessionPlan?.goal ? ` — ${sessionPlan.goal}` : ''}\n- Memoria: ${store.memory?.project || store.memory?.session ? 'cargada' : 'vacía'}\n- Permisos denegados: ${denied.length > 0 ? denied.join(', ') : 'ninguno'}\n- Checkpoint: ${store.checkpoint?.sessionId === sessionId ? `disponible (${store.checkpoint.label || 'último turno'})` : 'no disponible'}${lastTools}`
          );
          return true;
        }
        case '/plan': {
          const parts = parsed.args.split('|').map((p) => p.trim()).filter(Boolean);
          if (parts.length < 2) {
            appendLocalTurn(sessionId, raw, 'Uso: `/plan objetivo | paso 1 | paso 2 | ...` (mínimo 1 objetivo + 1 paso).', true);
            return true;
          }
          const plan = createPlan(parts[0], parts.slice(1));
          savePlansBySession({ ...(store.plansBySession || {}), [sessionId]: plan });
          appendLocalTurn(
            sessionId,
            raw,
            `## Plan propuesto (SIN aprobar)\n\nObjetivo: ${plan.goal}\n\n${plan.steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n')}\n\nUsa \`/approve\` para aprobarlo. Sin aprobación, el agente no lo ejecuta.`
          );
          return true;
        }
        case '/approve': {
          if (!sessionPlan || sessionPlan.status === 'none' || !sessionPlan.goal) {
            appendLocalTurn(sessionId, raw, 'No hay ningún plan propuesto. Crea uno con `/plan objetivo | paso 1 | ...`.', true);
            return true;
          }
          const approved = { ...sessionPlan, status: 'approved' as const, updatedAt: getCurrentTimestamp() };
          savePlansBySession({ ...(store.plansBySession || {}), [sessionId]: approved });
          appendLocalTurn(sessionId, raw, `Plan aprobado: **${approved.goal}**. Describe la primera acción o di "ejecuta el plan" para empezar.`);
          return true;
        }
        case '/todos': {
          if (sessionTodos.length === 0) {
            appendLocalTurn(sessionId, raw, 'No hay TODOs en esta sesión. Añade uno con `/todo add <texto>`.');
            return true;
          }
          const lines = sessionTodos.map((t, i) => {
            const icon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⬜';
            return `${i + 1}. ${icon} ${t.text}`;
          });
          appendLocalTurn(sessionId, raw, `## TODOs de la sesión\n\n${lines.join('\n')}\n\n\`/todo start N\` · \`/todo done N\``);
          return true;
        }
        case '/todo': {
          const sub = parsed.args.split(' ')[0]?.toLowerCase() || '';
          if (sub === 'add') {
            const text = parsed.args.slice(3).trim();
            if (!text) {
              appendLocalTurn(sessionId, raw, 'Uso: `/todo add <texto>`.', true);
              return true;
            }
            saveTodos([...sessionTodos, createTodo(text)]);
            appendLocalTurn(sessionId, raw, `TODO añadido (${sessionTodos.length + 1}): ${text}`);
            return true;
          }
          if (sub === 'done' || sub === 'start') {
            const n = parseInt(parsed.args.split(' ')[1] || '', 10);
            if (!Number.isFinite(n) || n < 1 || n > sessionTodos.length) {
              appendLocalTurn(sessionId, raw, `Uso: \`/todo ${sub} N\` con N entre 1 y ${sessionTodos.length}.`, true);
              return true;
            }
            const target = sessionTodos[n - 1];
            saveTodos(setTodoStatus(sessionTodos, target.id, sub === 'done' ? 'completed' : 'in_progress'));
            appendLocalTurn(sessionId, raw, `TODO ${n} → ${sub === 'done' ? 'completado ✅' : 'en curso 🔄'}.`);
            return true;
          }
          appendLocalTurn(sessionId, raw, 'Uso: `/todo add <texto>` · `/todo start N` · `/todo done N`.', true);
          return true;
        }
        case '/memory': {
          const sub = parsed.args.split(' ')[0]?.toLowerCase() || '';
          if (sub === 'show') {
            const mem = store.memory;
            appendLocalTurn(
              sessionId,
              raw,
              `## Memoria\n\n**Proyecto:**\n${mem?.project || '(vacía)'}\n\n**Sesión:**\n${mem?.session || '(vacía)'}`
            );
            return true;
          }
          if (sub === 'clear') {
            saveAgentMemory({ project: '', session: '', updatedAt: getCurrentTimestamp() });
            appendLocalTurn(sessionId, raw, 'Memoria borrada.');
            return true;
          }
          if (sub === 'project' || sub === 'session') {
            const text = parsed.args.slice(sub.length).trim();
            if (!text) {
              appendLocalTurn(sessionId, raw, `Uso: \`/memory ${sub} <texto>\`.`, true);
              return true;
            }
            const mem = store.memory || { project: '', session: '', updatedAt: 0 };
            const nextMemory = sub === 'project'
              ? { project: text, session: mem.session || '', updatedAt: getCurrentTimestamp() }
              : { project: mem.project || '', session: text, updatedAt: getCurrentTimestamp() };
            saveAgentMemory(nextMemory);
            appendLocalTurn(sessionId, raw, `Memoria de ${sub === 'project' ? 'proyecto' : 'sesión'} guardada (${text.length} caracteres). Se inyecta al prompt automáticamente.`);
            return true;
          }
          appendLocalTurn(sessionId, raw, 'Uso: `/memory show` · `/memory project <texto>` · `/memory session <texto>` · `/memory clear`.', true);
          return true;
        }
        case '/permissions': {
          const [mode, tool] = parsed.args.split(/\s+/);
          if (!mode) {
            const rows = Object.entries(store.toolPermissions || {}).map(([n, m]) => `- \`${n}\`: ${m}`);
            appendLocalTurn(sessionId, raw, `## Permisos de herramientas\n\n${rows.join('\n')}\n\nCambia con \`/permissions allow|deny <tool>\`. Lo denegado falla cerrado y queda en el transcript.`);
            return true;
          }
          if ((mode !== 'allow' && mode !== 'deny') || !tool) {
            appendLocalTurn(sessionId, raw, 'Uso: `/permissions allow|deny <tool>` (ej: `/permissions deny web_search`).', true);
            return true;
          }
          saveToolPermissions({ ...(store.toolPermissions || {}), [tool]: mode });
          appendLocalTurn(sessionId, raw, `Permiso actualizado: \`${tool}\` → ${mode}.`);
          return true;
        }
        case '/subagent': {
          if (!parsed.args) {
            appendLocalTurn(sessionId, raw, 'Uso: `/subagent <tarea acotada>` (ej: `/subagent investiga los precios actuales de GPUs`).', true);
            return true;
          }
          if (!activeProvider.apiKey?.trim()) {
            appendLocalTurn(sessionId, raw, 'El subagente necesita tu API Key: configúrala en Ajustes primero.', true);
            return true;
          }
          if (isGenerating) {
            appendLocalTurn(sessionId, raw, 'Espera a que termine la generación actual antes de delegar.', true);
            return true;
          }
          appendLocalTurn(sessionId, raw, `🔍 Subagente delegado: *${parsed.args}*\n\n(Herramientas permitidas: web_search. Contexto aislado.)`);
          try {
            const latest = getAppStoreSnapshot().sessions.find((s) => s.id === sessionId);
            const req = buildSubagentRequest(parsed.args, latest?.messages || [], ['web_search']);
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 90000);
            const res = await requestSingleCompletion(
              activeProvider,
              activeModelId,
              buildSubagentSystemPrompt(req),
              [...req.context, { role: 'user', content: req.task }],
              req.allowedTools,
              ctrl.signal
            ).finally(() => clearTimeout(timer));
            const toolsNote = res.toolUses.length > 0
              ? `\n\n---\n*Subagente usó: ${res.toolUses.map((t) => `${t.name}(${t.success ? 'ok' : t.blocked ? 'bloqueado' : 'fallo'})`).join(', ')}*`
              : '';
            const now = getCurrentTimestamp();
            const after = getAppStoreSnapshot().sessions.map((s) => {
              if (s.id !== sessionId) return s;
              return {
                ...s,
                messages: [
                  ...s.messages,
                  { id: createId('msg_a'), role: 'assistant', content: `## Resultado del subagente\n\n${res.content || '(sin contenido)'}${toolsNote}`, timestamp: now, model: activeModelId } as ChatMessage,
                ],
                updatedAt: now,
              };
            });
            saveSessions(after);
          } catch (e) {
            appendLocalTurn(sessionId, `/subagent (error)`, `El subagente falló: ${e instanceof Error ? e.message : String(e)}`, true);
          }
          return true;
        }
        case '/compact': {
          if (isGenerating) {
            appendLocalTurn(sessionId, raw, 'Espera a que termine la generación actual.', true);
            return true;
          }
          const latest = getAppStoreSnapshot().sessions.find((s) => s.id === sessionId);
          if (!latest || latest.messages.length === 0) {
            appendLocalTurn(sessionId, raw, 'No hay nada que compactar todavía.', true);
            return true;
          }
          appendLocalTurn(sessionId, raw, 'Compactando: pido al modelo un resumen para continuar ligero…');
          const fresh = getAppStoreSnapshot().sessions.find((s) => s.id === sessionId);
          if (fresh) {
            void runGeneration(
              'Resume esta conversación en 10 líneas: decisiones, datos clave y pendientes. Responde SOLO con el resumen.',
              fresh.messages,
              sessionId,
              fresh
            );
          }
          return true;
        }
        case '/undo': {
          const cp = store.checkpoint;
          if (!cp || cp.sessionId !== sessionId) {
            appendLocalTurn(sessionId, raw, 'No hay checkpoint disponible para esta sesión.', true);
            return true;
          }
          const restored = getAppStoreSnapshot().sessions.map((s) => {
            if (s.id !== sessionId) return s;
            return { ...s, messages: cp.messages.map((m) => ({ ...m })), updatedAt: getCurrentTimestamp() };
          });
          saveSessions(restored);
          saveCheckpoint(null);
          appendLocalTurn(sessionId, raw, `Checkpoint restaurado (${cp.label || 'último turno'}). Los mensajes volvieron al estado previo.`);
          return true;
        }
        case '/clear': {
          handleClearCurrentSession();
          return true;
        }
        case '/export': {
          setIsExportOpen(true);
          return true;
        }
        default:
          return false;
      }
    },
    [activeSession, activeProvider, activeModelId, isGenerating, runGeneration, appendLocalTurn, handleClearCurrentSession, setIsExportOpen]
  );

  // Handler: Send Message & Stream (intercepta slash commands locales primero)
  const handleSendMessage = useCallback(
    async (userContent: string, contextMessagesOverride?: ChatMessage[]) => {
      const trimmed = userContent.trim();
      if (!trimmed || !activeSession || isGenerating) return;
      if (!contextMessagesOverride) {
        const parsed = parseSlashCommand(trimmed);
        if (parsed) {
          if (isKnownSlash(parsed.name)) {
            await runSlashCommand(trimmed);
            return;
          }
          appendLocalTurn(activeSession.id, trimmed, `Comando desconocido: \`${parsed.name}\`. Escribe /help para ver la lista.`, true);
          return;
        }
      }
      const ctx = contextMessagesOverride ?? activeSession.messages;
      await runGeneration(trimmed, ctx, activeSession.id);
    },
    [activeSession, isGenerating, runGeneration, runSlashCommand, appendLocalTurn]
  );

  // Handler: Respond to an Ask-the-User card and continue the agent loop
  const handleAskAnswer = useCallback(
    (ask: AskPayload, answer: string) => {
      if (!activeSession || isGenerating) return;
      const currentSessionId = activeSession.id;

      // Marcar la tarjeta como respondida en el mensaje del asistente
      const currentSessions = getAppStoreSnapshot().sessions;
      const answeredSessions = currentSessions.map((s) => {
        if (s.id === currentSessionId) {
          const msgs = s.messages.map((m) =>
            m.asks && m.asks.some((a) => a.id === ask.id)
              ? { ...m, askAnswered: true }
              : m
          );
          return { ...s, messages: msgs };
        }
        return s;
      });
      saveSessions(answeredSessions);

      // Continuar el bucle: reenviar la respuesta del usuario al modelo
      const { sessions: latestSessions } = getAppStoreSnapshot();
      const latest = latestSessions.find((s) => s.id === currentSessionId);
      const replyContent = `[Respondiendo a tu pregunta "${ask.question}"]\nRespuesta: ${answer}`;
      if (latest) {
        void runGeneration(replyContent, latest.messages, currentSessionId, latest);
      }
    },
    [activeSession, isGenerating, runGeneration]
  );

  // Handler: Stop Generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    flushStreamingSave();
    setIsGenerating(false);
  };

  // Handler: Regenerate last assistant response
  const handleRegenerateResponse = () => {
    if (!activeSession || isGenerating) return;
    const messages = activeSession.messages;
    if (messages.length === 0) return;

    // Find last user message
    let lastUserMsgIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMsgIndex = i;
        break;
      }
    }

    if (lastUserMsgIndex === -1) return;

    const userPrompt = messages[lastUserMsgIndex].content;
    const slicedMessages = messages.slice(0, lastUserMsgIndex);

    const currentSessions = getAppStoreSnapshot().sessions;
    const updatedSessions = currentSessions.map((s) => {
      if (s.id === activeSession.id) {
        return { ...s, messages: slicedMessages };
      }
      return s;
    });
    saveSessions(updatedSessions);

    void handleSendMessage(userPrompt, slicedMessages);
  };

  // Handler: Seamlessly continue assistant response without creating broken disjoint turns
  const handleContinueGeneration = async (targetMsgId?: string) => {
    if (!activeSession || isGenerating) return;

    const msgs = activeSession.messages;
    let targetIndex = -1;

    if (targetMsgId) {
      targetIndex = msgs.findIndex((m) => m.id === targetMsgId);
    } else {
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          targetIndex = i;
          break;
        }
      }
    }

    if (targetIndex === -1) return;

    const targetMsg = msgs[targetIndex];
    const initialContent = targetMsg.content || '';
    const initialReasoning = targetMsg.reasoning_content || '';
    const currentSessionId = activeSession.id;

    // Take conversation context prior to this turn
    const contextMessages = msgs.slice(0, targetIndex);

    // Build targeted continuation instruction prompt
    const snippet = initialContent.slice(-120).trim();
    const continuationUserPrompt = snippet
      ? `Continúa exactamente desde donde te quedaste: "...${snippet}". Escribe la continuación del código y explicación de forma fluida y directa, sin repetir lo anterior.`
      : `Has completado el análisis y razonamiento previo. Procede ahora a redactar la respuesta completa, detallada y el código final para el usuario.`;

    const messagesToSend: ChatMessage[] = [
      ...contextMessages,
      {
        id: targetMsg.id,
        role: 'assistant',
        content: initialContent,
        reasoning_content: initialReasoning,
        timestamp: targetMsg.timestamp,
      },
      {
        id: createId('msg_u'),
        role: 'user',
        content: continuationUserPrompt,
        timestamp: getCurrentTimestamp(),
      },
    ];

    setIsGenerating(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let appendedContent = '';

    await sendChatMessageStream(
      activeProvider,
      activeModelId,
      messagesToSend,
      activeSession.parameters || DEFAULT_PARAMETERS,
      activeSession.systemPrompt || globalSystemPrompt,
      {
        onChunk: (chunk) => {
          appendedContent += chunk;
          const liveSessions = getAppStoreSnapshot().sessions;
          const liveUpdated = liveSessions.map((s) => {
            if (s.id === currentSessionId) {
              const updatedMsgs = s.messages.map((m) => {
                if (m.id === targetMsg.id) {
                  return {
                    ...m,
                    content: initialContent + appendedContent,
                    finish_reason: undefined,
                    isError: false,
                  };
                }
                return m;
              });
              return { ...s, messages: updatedMsgs };
            }
            return s;
          });
          saveSessionsStreaming(liveUpdated);
        },
        onReasoning: () => {},
        onToolCall: () => {},
        onToolResult: () => {},
        onDone: (finalChunkContent, _, tokens, finishReason) => {
          setIsGenerating(false);
          abortControllerRef.current = null;
          flushStreamingSave();
          const doneTimestamp = getCurrentTimestamp();
          const liveSessions = getAppStoreSnapshot().sessions;
          const newSessions = liveSessions.map((s) => {
            if (s.id === currentSessionId) {
              const updatedMsgs = s.messages.map((m) => {
                if (m.id === targetMsg.id) {
                  return {
                    ...m,
                    content: initialContent + (finalChunkContent || appendedContent),
                    finish_reason: finishReason === 'length' ? 'length' : undefined,
                    isError: false,
                    tokens: tokens
                      ? {
                          prompt: (m.tokens?.prompt || 0) + (tokens.prompt || 0),
                          completion: (m.tokens?.completion || 0) + (tokens.completion || 0),
                          total: (m.tokens?.total || 0) + (tokens.total || 0),
                        }
                      : m.tokens,
                  };
                }
                return m;
              });
              return { ...s, messages: updatedMsgs, updatedAt: doneTimestamp };
            }
            return s;
          });
          saveSessions(newSessions);
        },
        onError: (errMessage) => {
          setIsGenerating(false);
          abortControllerRef.current = null;
          flushStreamingSave();
          const liveSessions = getAppStoreSnapshot().sessions;
          const newSessions = liveSessions.map((s) => {
            if (s.id === currentSessionId) {
              const updatedMsgs = s.messages.map((m) => {
                if (m.id === targetMsg.id) {
                  return {
                    ...m,
                    isError: true,
                    content: m.content ? `${m.content}\n\n⚠️ Error al continuar: ${errMessage}` : errMessage,
                  };
                }
                return m;
              });
              return { ...s, messages: updatedMsgs };
            }
            return s;
          });
          saveSessions(newSessions);
        },
      },
      controller.signal,
      undefined,
      agentRules,
      agentSkills,
      activePersona || undefined,
      undefined,
      runtimeSnapshot,
    );
  };

  // Handler: Edit user message & regenerate
  const handleEditUserMessage = (msgId: string, newContent: string) => {
    if (!activeSession || isGenerating) return;
    const msgIndex = activeSession.messages.findIndex((m) => m.id === msgId);
    if (msgIndex === -1) return;

    const sliced = activeSession.messages.slice(0, msgIndex);
    const currentSessions = getAppStoreSnapshot().sessions;
    const updatedSessions = currentSessions.map((s) => {
      if (s.id === activeSession.id) {
        return { ...s, messages: sliced };
      }
      return s;
    });
    saveSessions(updatedSessions);

    void handleSendMessage(newContent, sliced);
  };

  const hasApiKey = Boolean(activeProvider.apiKey?.trim());

  // Uso de la ventana de contexto (para el indicador de compactación)
  const activeModelInfo = activeCachedModels.find((m) => m.id === activeModelId);
  const contextWindow = windowSizeForContextLength(activeModelInfo?.context_length);
  const contextUsage = useMemo(() => {
    if (!activeSession) return { used: 0, window: contextWindow, percent: 0 };
    let used = 0;
    for (const m of activeSession.messages) {
      used += estimateTokenCount(m.content || '') + estimateTokenCount(m.reasoning_content || '');
    }
    const window = windowSizeForContextLength(
      activeCachedModels.find((mm) => mm.id === activeSession.modelId)?.context_length
    );
    return { used, window, percent: Math.min(100, Math.round((used / window) * 100)) };
  }, [activeSession, activeCachedModels]);

  // Auth gate — show login screen if not authenticated
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a]">
        <div className="w-6 h-6 border-2 border-neutral-300 dark:border-neutral-600 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authEmail) {
    return <AuthScreen onAuthenticated={(email) => setAuthEmail(email)} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#232323] text-neutral-900 dark:text-neutral-100 font-sans antialiased">
      {/* Sidebar Component */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        activeProvider={activeProvider}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onPinSession={handlePinSession}
        onExportSession={() => setIsExportOpen(true)}
        onClearAllSessions={handleClearAllSessions}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={handleToggleDarkMode}
      />

      {/* Main Chat View Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative overflow-hidden bg-white dark:bg-[#232323]">
        {/* Top Header Bar */}
        <header
          id="chat-header-bar"
          className="h-14 border-b border-neutral-200 dark:border-neutral-800/80 bg-white/80 dark:bg-[#232323]/80 backdrop-blur-md px-4 flex items-center justify-between z-20 flex-shrink-0"
        >
          {/* Left: Sidebar Toggle + Model Dropdown */}
          <div className="flex items-center gap-2 min-w-0">
            {!isSidebarOpen && (
              <button
                type="button"
                id="sidebar-open-btn"
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Mostrar barra lateral"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <button
              type="button"
              id="header-new-chat-btn"
              onClick={handleNewChat}
              className="p-2 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors md:hidden"
              title="Nuevo chat"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Model Selector Dropdown */}
            <ModelDropdown
              activeModelId={activeModelId}
              provider={activeProvider}
              providers={providers}
              cachedModels={activeCachedModels}
              onSelectModel={handleSelectActiveModel}
              onSelectProvider={handleSelectActiveProvider}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onModelsUpdated={(models) => {
                setCachedModelsOverride(models);
                saveCachedModels(activeProviderId, models);
              }}
            />
          </div>

          {/* Right Header Action Icons */}
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 overflow-x-auto scrollbar-hide">
            {/* System Prompt Custom Instructions */}
            <button
              type="button"
              id="system-prompt-btn"
              onClick={() => setIsSystemPromptOpen(true)}
              title="Instrucciones del Sistema (System Prompt)"
              className="flex-shrink-0 p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Wand2 className="w-4 h-4" />
            </button>

            {/* Parameters Sliders */}
            <button
              type="button"
              id="parameters-btn"
              onClick={() => setIsParametersOpen(true)}
              title="Ajustar Parámetros (Temperatura, Tokens)"
              className="flex-shrink-0 p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Export Chat */}
            {activeSession && activeSession.messages.length > 0 && (
              <button
                type="button"
                id="export-chat-btn"
                onClick={() => setIsExportOpen(true)}
                title="Exportar conversación (.md / .json)"
                className="flex-shrink-0 p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}

            {/* Clear Current Chat */}
            {activeSession && activeSession.messages.length > 0 && (
              <button
                type="button"
                id="clear-chat-btn"
                onClick={handleClearCurrentSession}
                title="Limpiar mensajes de esta conversación"
                className="flex-shrink-0 p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {/* Browser-only toolbench */}
            <button
              type="button"
              id="header-tools-btn"
              onClick={() => setIsToolsOpen(true)}
              title="Abrir herramientas locales"
              className="flex-shrink-0 p-2 rounded-xl text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-blue-500/20 transition-colors flex items-center gap-1 text-xs font-semibold"
            >
              <Wrench className="w-4 h-4" />
              <span className="hidden sm:inline">Herramientas</span>
            </button>

            {/* Agent Rules */}
            <button
              type="button"
              id="header-rules-btn"
              onClick={() => setIsRulesOpen(true)}
              title="Reglas del agente"
              className="flex-shrink-0 p-2 rounded-xl text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-emerald-500/20 transition-colors flex items-center gap-1 text-xs font-semibold"
            >
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Reglas</span>
            </button>

            {/* Agent Skills */}
            <button
              type="button"
              id="header-skills-btn"
              onClick={() => setIsSkillsOpen(true)}
              title="Skills del agente"
              className="flex-shrink-0 p-2 rounded-xl text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-purple-500/20 transition-colors flex items-center gap-1 text-xs font-semibold"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Skills</span>
            </button>

            {/* Agent status: plan + TODOs (estilo Claude Code, solo lectura) */}
            {(activePlan?.goal || openTodoCount > 0) && (
              <span
                title={`${activePlan?.goal ? `Plan ${activePlan.status}: ${activePlan.goal}` : 'Sin plan'} · TODOs abiertos: ${openTodoCount}. Usa /status para detalle.`}
                className="hidden md:flex flex-shrink-0 items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
              >
                <ListTodo className="w-3.5 h-3.5 text-accent" />
                {activePlan?.goal ? `Plan: ${activePlan.status}` : 'Sin plan'}
                <span className="opacity-60">·</span>
                <span>TODOs: {openTodoCount}</span>
              </span>
            )}

            {/* Undo last turn (checkpoint local) */}
            {checkpoint?.sessionId === activeSession?.id && !isGenerating && (
              <button
                type="button"
                id="header-undo-btn"
                onClick={() => void runSlashCommand('/undo')}
                title="Restaurar mensajes previos al último turno (/undo)"
                className="flex-shrink-0 p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <Undo2 className="w-4 h-4" />
              </button>
            )}

            {/* Provider & Base URL Settings Trigger */}
            <button
              type="button"
              id="header-settings-btn"
              onClick={() => setIsSettingsOpen(true)}
              title="Configurar API & Base URL"
              className="flex-shrink-0 p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Logout Button */}
            {authEmail && authEmail !== 'local' && (
              <button
                type="button"
                onClick={() => {
                  clearLocalSession();
                  setAuthEmail(null);
                }}
                title="Cerrar sesion"
                className="flex-shrink-0 p-2 rounded-xl text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Chat Messages Canvas / Empty State */}
        <div
          id="chat-messages-container"
          className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col justify-between"
        >
          {activeSession && activeSession.messages.length > 0 ? (
            <div className="py-4 space-y-0 w-full">
              {activeSession.messages.map((msg, index) => {
                const isLastAssistant =
                  msg.role === 'assistant' &&
                  index === activeSession.messages.length - 1;

                return (
                  <ChatMessageItem
                    key={msg.id}
                    message={msg}
                    isStreaming={isGenerating && isLastAssistant}
                    onRegenerate={
                      msg.role === 'assistant' ? handleRegenerateResponse : undefined
                    }
                    onContinue={
                      msg.role === 'assistant' && !isGenerating
                        ? () => handleContinueGeneration(msg.id)
                        : undefined
                    }
                    onEdit={
                      msg.role === 'user'
                        ? (newText) => handleEditUserMessage(msg.id, newText)
                        : undefined
                    }
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    onOpenParameters={() => setIsParametersOpen(true)}
                    onAskAnswer={handleAskAnswer}
                  />
                );
              })}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          ) : (
            <EmptyState
              provider={activeProvider}
              activeModelId={activeModelId}
              hasApiKey={hasApiKey}
              onSelectPrompt={(prompt) => handleSendMessage(prompt)}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}
        </div>

        {/* Bottom Floating Chat Input */}
        <div className="w-full flex-shrink-0 z-10">
          {activeSession && activeSession.messages.length > 0 && (
            <div className="max-w-4xl mx-auto px-4 pt-1 pb-1">
              <div className="flex items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500">
                <span className="whitespace-nowrap">
                  Contexto: {contextUsage.percent}%
                </span>
                <div className="flex-1 h-1 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      contextUsage.percent >= 90
                        ? 'bg-red-500'
                        : contextUsage.percent >= 70
                        ? 'bg-amber-500'
                        : 'bg-accent'
                    }`}
                    style={{ width: `${Math.max(2, contextUsage.percent)}%` }}
                  />
                </div>
                <span className="whitespace-nowrap font-mono">
                  {contextUsage.used.toLocaleString()} / {contextUsage.window.toLocaleString()} tok
                </span>
              </div>
            </div>
          )}
          <ChatInput
            onSendMessage={handleSendMessage}
            onStopGeneration={handleStopGeneration}
            isGenerating={isGenerating}
            activeModelName={activeModelId}
            placeholder={
              hasApiKey
                ? `Envía un mensaje a ${activeModelId.split('/').pop()}...`
                : 'Configura tu API Key en Ajustes para comenzar a chatear...'
            }
          />
        </div>
      </main>

      {/* Settings Modal (Provider & Base URL & Models Explorer) */}
      <SafeErrorBoundary fallbackText="Fallo al abrir la configuración.">
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          providers={providers}
          activeProviderId={activeProviderId}
          onUpdateProviders={(newProviders) => {
            saveProviders(newProviders);
          }}
          onSelectActiveProvider={handleSelectActiveProvider}
          onSelectActiveModel={handleSelectActiveModel}
        />
      </SafeErrorBoundary>

      {/* Hyperparameters Modal */}
      {activeSession && (
        <SafeErrorBoundary fallbackText="Fallo al abrir los parámetros.">
          <ParametersModal
            isOpen={isParametersOpen}
            onClose={() => setIsParametersOpen(false)}
            parameters={activeSession.parameters || DEFAULT_PARAMETERS}
            onChangeParameters={handleUpdateParameters}
          />
        </SafeErrorBoundary>
      )}

      {/* System Prompt Custom Instructions Modal */}
      <SafeErrorBoundary fallbackText="Fallo al abrir las instrucciones del sistema.">
        <SystemPromptModal
          isOpen={isSystemPromptOpen}
          onClose={() => setIsSystemPromptOpen(false)}
          systemPrompt={activeSession?.systemPrompt || globalSystemPrompt}
          onSaveSystemPrompt={handleSaveSystemPrompt}
        />
      </SafeErrorBoundary>

      {/* Export Conversation Modal */}
      <SafeErrorBoundary fallbackText="Fallo al abrir la exportación.">
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          session={activeSession}
        />
      </SafeErrorBoundary>

      <SafeErrorBoundary fallbackText="Fallo al abrir las herramientas locales.">
        <ToolsModal isOpen={isToolsOpen} onClose={() => setIsToolsOpen(false)} />
      </SafeErrorBoundary>

      <SafeErrorBoundary fallbackText="Fallo al abrir las reglas del agente.">
        <RulesModal
          isOpen={isRulesOpen}
          onClose={() => setIsRulesOpen(false)}
          rules={agentRules || []}
          onSaveRules={saveAgentRules}
        />
      </SafeErrorBoundary>

      <SafeErrorBoundary fallbackText="Fallo al abrir los skills del agente.">
        <SkillsModal
          isOpen={isSkillsOpen}
          onClose={() => setIsSkillsOpen(false)}
          skills={agentSkills || []}
          onSaveSkills={saveAgentSkills}
        />
      </SafeErrorBoundary>
    </div>
  );
}

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
} from 'lucide-react';
import { 
  ProviderConfig, 
  ModelInfo, 
  ChatSession, 
  ChatMessage, 
  ModelParameters,
  DEFAULT_PARAMETERS,
  AskPayload,
} from '@/lib/types';
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
  saveActiveSessionId, 
  saveGlobalSystemPrompt,
  createNewSession
} from '@/lib/storage';
import { createId, getCurrentTimestamp } from '@/lib/utils';
import { sendChatMessageStream } from '@/lib/api-client';
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

export default function Home() {
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
  } = appState;

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
  
  // Streaming state
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync theme on mount
  useEffect(() => {
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedDark = localStorage.getItem('chat_dark_mode_v1');
    const darkModeActive = savedDark !== null ? savedDark === 'true' : isDark;
    setIsDarkMode(darkModeActive);
    if (darkModeActive) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
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
    async (userContent: string, contextMessages: ChatMessage[], targetSessionId?: string) => {
      if (!userContent.trim() || !activeSession || isGenerating) return;

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

      await sendChatMessageStream(
        activeProvider,
        activeModelId,
        [...contextMessages, userMessage],
        activeSession.parameters || DEFAULT_PARAMETERS,
        activeSession.systemPrompt || globalSystemPrompt,
        {
          onChunk: (chunk) => {
            accumulatedContent += chunk;
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
            saveSessions(liveUpdated);
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
            saveSessions(liveUpdated);
          },
          onDone: (finalContent, finalReasoning, tokens, finishReason) => {
            setIsGenerating(false);
            abortControllerRef.current = null;
            const doneTimestamp = getCurrentTimestamp();
            const combined = finalContent || accumulatedContent;

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
        contextWindow
      );
    },
    [activeProvider, activeModelId, activeSession, globalSystemPrompt, isGenerating, activeCachedModels]
  );

  // Handler: Send Message & Stream
  const handleSendMessage = useCallback(
    async (userContent: string, contextMessagesOverride?: ChatMessage[]) => {
      if (!userContent.trim() || !activeSession || isGenerating) return;
      const ctx = contextMessagesOverride ?? activeSession.messages;
      await runGeneration(userContent, ctx, activeSession.id);
    },
    [activeSession, isGenerating, runGeneration]
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
        void runGeneration(replyContent, latest.messages, currentSessionId);
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
          saveSessions(liveUpdated);
        },
        onReasoning: () => {},
        onDone: (finalChunkContent, _, tokens, finishReason) => {
          setIsGenerating(false);
          abortControllerRef.current = null;
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
      controller.signal
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
          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* System Prompt Custom Instructions */}
            <button
              type="button"
              id="system-prompt-btn"
              onClick={() => setIsSystemPromptOpen(true)}
              title="Instrucciones del Sistema (System Prompt)"
              className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Wand2 className="w-4 h-4" />
            </button>

            {/* Parameters Sliders */}
            <button
              type="button"
              id="parameters-btn"
              onClick={() => setIsParametersOpen(true)}
              title="Ajustar Parámetros (Temperatura, Tokens)"
              className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
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
                className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
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
                className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
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
              className="p-2 rounded-xl text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-blue-500/20 transition-colors flex items-center gap-1 text-xs font-semibold"
            >
              <Wrench className="w-4 h-4" />
              <span className="hidden sm:inline">Herramientas</span>
            </button>

            {/* Provider & Base URL Settings Trigger */}
            <button
              type="button"
              id="header-settings-btn"
              onClick={() => setIsSettingsOpen(true)}
              title="Configurar API & Base URL"
              className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
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

      {/* Hyperparameters Modal */}
      {activeSession && (
        <ParametersModal
          isOpen={isParametersOpen}
          onClose={() => setIsParametersOpen(false)}
          parameters={activeSession.parameters || DEFAULT_PARAMETERS}
          onChangeParameters={handleUpdateParameters}
        />
      )}

      {/* System Prompt Custom Instructions Modal */}
      <SystemPromptModal
        isOpen={isSystemPromptOpen}
        onClose={() => setIsSystemPromptOpen(false)}
        systemPrompt={activeSession?.systemPrompt || globalSystemPrompt}
        onSaveSystemPrompt={handleSaveSystemPrompt}
      />

      {/* Export Conversation Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        session={activeSession}
      />

      <ToolsModal isOpen={isToolsOpen} onClose={() => setIsToolsOpen(false)} />
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { 
  Check, 
  Copy, 
  RotateCw, 
  Edit3, 
  Volume2, 
  VolumeX, 
  ChevronDown, 
  ChevronRight, 
  Sparkles, 
  AlertCircle,
  Brain,
  Settings
} from 'lucide-react';
import { ChatMessage, AskPayload } from '@/lib/types';
import { StreamRenderer } from '@/components/StreamRenderer';
import { AskCard } from '@/components/AskCard';

interface ChatMessageItemProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onEdit?: (newContent: string) => void;
  onOpenSettings?: () => void;
  onOpenParameters?: () => void;
  onAskAnswer?: (ask: AskPayload, answer: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  isStreaming = false,
  onRegenerate,
  onContinue,
  onEdit,
  onOpenSettings,
  onOpenParameters,
  onAskAnswer,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(message.content);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);

  const isThinking = isStreaming && !!message.reasoning_content && !message.content;

  // Auto-expandir el panel de razonamiento mientras el modelo "piensa" en streaming
  useEffect(() => {
    if (isStreaming && message.reasoning_content) {
      setIsReasoningOpen(true);
    }
  }, [isStreaming, message.reasoning_content]);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTruncated = message.finish_reason === 'length';

  // Copy full message
  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Text to Speech
  const handleSpeak = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.lang = 'es-ES';
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    setIsPlayingAudio(true);
    window.speechSynthesis.speak(utterance);
  };

  // Save edit
  const handleSaveEdit = () => {
    if (!editedText.trim()) return;
    if (onEdit) {
      onEdit(editedText);
    }
    setIsEditing(false);
  };

  return (
    <div
      id={`chat-msg-${message.id}`}
      className={`group w-full py-4 px-4 sm:px-6 md:px-8 transition-colors ${
        isUser
          ? 'bg-transparent'
          : 'bg-neutral-50/50 dark:bg-[#1c1c1d]/40'
      } ${isStreaming ? 'msg-enter' : ''}`}
    >
      <div className={`max-w-3xl mx-auto ${isUser ? 'flex justify-end' : 'flex items-start gap-3 sm:gap-4'}`}>
        {/* Avatar Icon (assistant only) */}
        {!isUser && (
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center font-medium text-xs shadow-sm ring-1 ring-accent/20">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className={`${isUser ? 'max-w-[82%] sm:max-w-[525px]' : 'flex-1 min-w-0'} space-y-2`}>
          {/* Header Info */}
          {!isUser && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                {message.model ? message.model.split('/').pop() : 'Asistente'}
              </span>
              {message.model && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-200/80 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-mono">
                  {message.model}
                </span>
              )}
            </div>

            {/* Timestamp & Tokens */}
            <div className="text-[11px] text-neutral-400 dark:text-neutral-500 flex items-center gap-2">
              {message.tokens?.total ? (
                <span title={`Prompt: ${message.tokens.prompt || 0} | Completion: ${message.tokens.completion || 0}`}>
                  {message.tokens.total} tokens
                </span>
              ) : null}
              <span suppressHydrationWarning>{message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            </div>
          </div>
          )}
          {isUser && (
          <div className="text-[11px] text-neutral-400 dark:text-neutral-500 flex items-center gap-2 justify-end">
            <span className="font-semibold text-xs text-neutral-600 dark:text-neutral-300">Tú</span>
            <span suppressHydrationWarning>{message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          </div>
          )}

          {/* DeepSeek / Thinking Collapsible Block */}
          {message.reasoning_content && (
            <div className="my-2 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden bg-neutral-100/50 dark:bg-[#141414]">
              <button
                type="button"
                onClick={() => setIsReasoningOpen(!isReasoningOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/40 dark:hover:bg-neutral-800/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Brain className={`w-3.5 h-3.5 text-indigo-500 ${isThinking ? 'animate-pulse' : ''}`} />
                  {isThinking ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-500">
                      Pensando
                      <span className="inline-flex gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </span>
                  ) : (
                    <span>Proceso de Pensamiento / Razonamiento</span>
                  )}
                </div>
                {isReasoningOpen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
              {isReasoningOpen && (
                <div className="p-3 text-xs text-neutral-600 dark:text-neutral-400 font-mono whitespace-pre-wrap border-t border-neutral-200 dark:border-neutral-800 bg-white/40 dark:bg-black/20 max-h-64 overflow-y-auto">
                  {message.reasoning_content ? (
                    message.reasoning_content
                  ) : isThinking ? (
                    <div className="space-y-1.5" aria-label="Razonando">
                      <div className="thinking-shimmer h-2.5 w-full rounded" />
                      <div className="thinking-shimmer h-2.5 w-11/12 rounded" />
                      <div className="thinking-shimmer h-2.5 w-4/5 rounded" />
                    </div>
                  ) : (
                    ''
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error Banner if message failed */}
          {message.isError ? (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 text-red-700 dark:text-red-300 text-sm space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                <div className="flex-1 whitespace-pre-wrap font-medium">{message.content}</div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {onRegenerate && (
                  <button
                    type="button"
                    onClick={onRegenerate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors shadow-sm"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Reintentar
                  </button>
                )}
                {onOpenParameters && (
                  <button
                    type="button"
                    onClick={onOpenParameters}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-800 dark:text-red-200 text-xs transition-colors"
                  >
                    ⚡ Ajustar Tokens
                  </button>
                )}
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-medium transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Abrir Ajustes (API Key)
                  </button>
                )}
              </div>
            </div>
          ) : isEditing ? (
            /* Editing user message */
            <div className="space-y-2 pt-1">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full p-3 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                rows={3}
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1.5 text-xs font-medium bg-accent text-white hover:bg-accent-hover rounded-md shadow-sm transition-colors"
                >
                  Guardar y Enviar
                </button>
              </div>
            </div>
          ) : (
            /* Message Body */
            <div
              className={`${
                isUser
                  ? 'text-sm sm:text-[15px] text-white dark:text-neutral-100 leading-relaxed break-words rounded-[22px] bg-gradient-to-br from-[#3b7be0] to-[#3f3f41] dark:from-[#3b7be0] dark:to-[#3f3f41] px-4 py-2.5 shadow-md shadow-accent/10'
                  : 'text-sm sm:text-base text-neutral-800 dark:text-neutral-200 leading-relaxed break-words max-w-none'
              }`}
            >
              {message.content ? (
                <StreamRenderer content={message.content} isStreaming={isStreaming} />
              ) : isStreaming ? null : isAssistant ? (
                <div className="text-sm text-neutral-500 dark:text-neutral-400 italic space-y-2 py-1">
                  <div className="flex items-center gap-2">
                    <span>
                      {message.reasoning_content
                        ? 'El modelo completó la fase de razonamiento pero agotó el límite de tokens antes de finalizar la respuesta.'
                        : '(Sin respuesta del modelo)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 not-italic">
                    {onContinue && (
                      <button
                        type="button"
                        onClick={onContinue}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-sm transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Continuar escribiendo respuesta
                      </button>
                    )}
                    {onRegenerate && (
                      <button
                        type="button"
                        onClick={onRegenerate}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-medium transition-colors"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        Reintentar
                      </button>
                    )}
                    {onOpenParameters && (
                      <button
                        type="button"
                        onClick={onOpenParameters}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs transition-colors"
                      >
                        Aumentar Tokens Máximos
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Streaming Cursor (bloque animado) */}
              {isStreaming && (
                <span className="typing-cursor ml-1" aria-hidden="true" />
              )}
            </div>
          )}

          {/* Ask-the-User interactive cards */}
          {isAssistant && message.asks && message.asks.length > 0 && !message.askAnswered && !isStreaming && !message.isError && (
            <div className="flex flex-col gap-2">
              {message.asks.map((ask) => (
                <AskCard
                  key={ask.id}
                  ask={ask}
                  disabled={!onAskAnswer}
                  onAnswer={(a, answer) => onAskAnswer && onAskAnswer(a, answer)}
                />
              ))}
            </div>
          )}

          {/* Truncation / Token Limit Banner */}
          {isTruncated && !isStreaming && !message.isError && (
            <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span>
                  La respuesta se cortó al alcanzar el límite de tokens ({message.tokens?.completion || message.tokens?.total || 'máx'}).
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {onContinue && (
                  <button
                    type="button"
                    onClick={onContinue}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors shadow-xs"
                  >
                    <Sparkles className="w-3 h-3" />
                    Continuar generación
                  </button>
                )}
                {onOpenParameters && (
                  <button
                    type="button"
                    onClick={onOpenParameters}
                    className="px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-200 transition-colors"
                  >
                    Ajustar tokens
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Action Toolbar */}
          {!isEditing && !isStreaming && !message.isError && (
            <div className="flex items-center gap-1 pt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleCopyMessage}
                title="Copiar mensaje"
                className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={handleSpeak}
                title={isPlayingAudio ? "Detener lectura" : "Escuchar mensaje"}
                className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                {isPlayingAudio ? (
                  <VolumeX className="w-3.5 h-3.5 text-accent" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              {isUser && onEdit && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  title="Editar mensaje"
                  className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}

              {isAssistant && onContinue && (
                <button
                  type="button"
                  onClick={onContinue}
                  title="Continuar generación"
                  className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                </button>
              )}

              {isAssistant && onRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  title="Regenerar respuesta"
                  className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

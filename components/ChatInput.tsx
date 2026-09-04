'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
  Send,
  Square,
  Paperclip,
  X,
  FileText,
  Sparkles,
  Terminal
} from 'lucide-react';
import { SLASH_COMMANDS } from '@/lib/claude-runtime';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onStopGeneration: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  placeholder?: string;
  activeModelName?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onStopGeneration,
  isGenerating,
  disabled = false,
  placeholder = 'Envía un mensaje a ChatGPT...',
  activeModelName,
}) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; content: string; size: string }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [text]);

  // Slash commands locales (estilo Claude Code). Tab o clic completa; Enter envía.
  const slashToken = text.startsWith('/') && !text.includes('\n')
    ? text.slice(1).split(' ')[0].toLowerCase()
    : null;
  const slashMatches = slashToken !== null
    ? SLASH_COMMANDS.filter((c) => c.name.slice(1).startsWith(slashToken)).slice(0, 7)
    : [];
  const [slashIndex, setSlashIndex] = useState(0);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashToken]);

  const completeSlash = (name: string) => {
    setText(`${name} `);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMatches.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setSlashIndex((i) => (e.key === 'ArrowDown'
        ? (i + 1) % slashMatches.length
        : (i - 1 + slashMatches.length) % slashMatches.length));
      return;
    }
    if (e.key === 'Tab' && slashMatches.length > 0) {
      e.preventDefault();
      completeSlash(slashMatches[slashIndex]?.name || slashMatches[0].name);
      return;
    }
    if (e.key === 'Escape' && slashMatches.length > 0) {
      setText('');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (isGenerating) return;

    let fullMessage = text.trim();
    if (attachments.length > 0) {
      const attachmentsText = attachments
        .map(
          (a) => `\`\`\`archivo: ${a.name}\n${a.content}\n\`\`\``
        )
        .join('\n\n');

      if (fullMessage) {
        fullMessage = `${fullMessage}\n\n${attachmentsText}`;
      } else {
        fullMessage = attachmentsText;
      }
    }

    if (fullMessage) {
      onSendMessage(fullMessage);
      setText('');
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const sizeKb = (file.size / 1024).toFixed(1);
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            content,
            size: `${sizeKb} KB`,
          },
        ]);
      };
      reader.readAsText(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const approxTokens = Math.ceil(text.length / 4);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-4 sm:pb-6">
      <div
        id="chat-input-container"
        className="relative bg-white dark:bg-[#1c1c1d] border border-neutral-200 dark:border-neutral-700/60 rounded-[22px] shadow-lg shadow-black/5 dark:shadow-black/30 focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent transition-all"
      >
        {/* Attachments list */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 border-b border-neutral-100 dark:border-neutral-800">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700"
              >
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span className="max-w-[150px] truncate font-medium">{att.name}</span>
                <span className="text-[10px] text-neutral-400">({att.size})</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Slash command autocomplete */}
        {slashMatches.length > 0 && (
          <div className="mx-3 mt-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 overflow-hidden">
            {slashMatches.map((cmd, i) => (
              <button
                key={cmd.name}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); completeSlash(cmd.name); }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 text-xs transition-colors ${
                  i === slashIndex ? 'bg-accent/10 text-accent' : 'text-neutral-600 dark:text-neutral-300'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-mono font-semibold">{cmd.name}</span>
                <span className="truncate opacity-70">{cmd.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="flex items-end gap-2 p-3 sm:p-3.5">
          {/* File attachment button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            className="hidden"
            accept=".txt,.md,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.csv,.sql,.c,.cpp,.rs,.go,.yaml,.yml"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Adjuntar archivo de texto / código"
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex-shrink-0"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            id="chat-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="flex-1 max-h-52 bg-transparent text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 text-sm sm:text-base resize-none focus:outline-none py-1.5 px-1 leading-relaxed"
          />

          {/* Action button: Send or Stop — circular DeepSeek style */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isGenerating ? (
              <button
                type="button"
                id="stop-generation-btn"
                onClick={onStopGeneration}
                title="Detener respuesta"
                className="w-8 h-8 rounded-full bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 hover:opacity-85 transition-all shadow-sm flex items-center justify-center"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                id="send-message-btn"
                onClick={handleSubmit}
                disabled={(!text.trim() && attachments.length === 0) || disabled}
                title="Enviar mensaje (Enter)"
                className={`w-8 h-8 rounded-full transition-all flex items-center justify-center ${
                  text.trim() || attachments.length > 0
                    ? 'bg-accent text-white hover:bg-accent-hover shadow-md shadow-accent/30'
                    : 'bg-neutral-200 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600 cursor-not-allowed'
                }`}
              >
                <Send className="w-3.5 h-3.5 ml-0.5" />
              </button>
            )}
          </div>
        </div>

        {/* Footer info bar */}
        <div className="px-4 pb-2.5 flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
          <div className="flex items-center gap-2">
            {activeModelName && (
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-accent" />
                <span className="truncate max-w-[200px]">{activeModelName}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {text.length > 0 && <span>~{approxTokens} tokens ({text.length} caracteres)</span>}
            <span className="hidden sm:inline">Shift + Enter para salto de línea · / para comandos</span>
          </div>
        </div>
      </div>
    </div>
  );
};

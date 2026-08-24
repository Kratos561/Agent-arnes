'use client';

import React, { useRef, useEffect, useState } from 'react';
import { 
  Send, 
  Square, 
  Paperclip, 
  X, 
  FileText, 
  CornerDownLeft,
  Sparkles
} from 'lucide-react';

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        className="relative bg-white dark:bg-[#212121] border border-neutral-200 dark:border-neutral-700/80 rounded-2xl shadow-lg shadow-black/5 dark:shadow-black/20 focus-within:ring-2 focus-within:ring-emerald-500/50 focus-within:border-emerald-500 transition-all"
      >
        {/* Attachments list */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 border-b border-neutral-100 dark:border-neutral-800">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
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

          {/* Action button: Send or Stop */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isGenerating ? (
              <button
                type="button"
                id="stop-generation-btn"
                onClick={onStopGeneration}
                title="Detener respuesta"
                className="p-2 sm:p-2.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-85 transition-all shadow-sm flex items-center justify-center"
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
                className={`p-2 sm:p-2.5 rounded-xl transition-all flex items-center justify-center ${
                  text.trim() || attachments.length > 0
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 shadow-sm'
                    : 'bg-neutral-200 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600 cursor-not-allowed'
                }`}
              >
                <CornerDownLeft className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Footer info bar */}
        <div className="px-4 pb-2.5 flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
          <div className="flex items-center gap-2">
            {activeModelName && (
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-500" />
                <span className="truncate max-w-[200px]">{activeModelName}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {text.length > 0 && <span>~{approxTokens} tokens ({text.length} caracteres)</span>}
            <span className="hidden sm:inline">Shift + Enter para salto de línea</span>
          </div>
        </div>
      </div>
    </div>
  );
};

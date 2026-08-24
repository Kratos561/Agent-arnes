'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { sanitizeMathDelimiters } from '@/lib/katex-sanitizer';
import { SafeErrorBoundary } from '@/components/SafeErrorBoundary';
import { SafeKaTeX } from '@/components/SafeKaTeX';
import { ArtifactViewer, CodeArtifactFile } from '@/components/ArtifactViewer';
import hljs from 'highlight.js';
import { Check, Copy } from 'lucide-react';

interface StreamRendererProps {
  content: string;
  isStreaming?: boolean;
}

export const StreamRenderer: React.FC<StreamRendererProps> = ({
  content,
  isStreaming = false,
}) => {
  const [debouncedContent, setDebouncedContent] = useState(content);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Buffer de renderizado con debounce léxico para streaming rápido (Fase 2.1)
  useEffect(() => {
    if (!isStreaming) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      return;
    }

    // Si está en streaming, aplicar micro-batching de 40ms para evitar layout thrashing
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedContent(content);
    }, 40);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [content, isStreaming]);

  // Pre-procesamiento de sanitización para KaTeX ($ vs monedas y $VAR)
  const sanitizedContent = useMemo(() => {
    const rawToRender = isStreaming ? debouncedContent : content;
    return sanitizeMathDelimiters(rawToRender);
  }, [debouncedContent, content, isStreaming]);

  // Detección opcional de múltiples archivos de código consecutivos o proyectados
  const detectedMultiFiles = useMemo(() => {
    if (isStreaming) return null;
    const fileRegex = /```(\w+)?\s*(?:file|filename)=["']?([^"'\n]+)["']?\n([\s\S]*?)```/g;
    const matches: CodeArtifactFile[] = [];
    let match: RegExpExecArray | null;

    while ((match = fileRegex.exec(content)) !== null) {
      matches.push({
        language: match[1] || 'plaintext',
        filename: match[2] || `file-${matches.length + 1}`,
        content: match[3]?.trim() || '',
      });
    }

    return matches.length >= 2 ? matches : null;
  }, [content, isStreaming]);

  return (
    <SafeErrorBoundary fallbackText="Error al renderizar el formato Markdown. Mostrando contenido seguro.">
      <div className="stream-renderer w-full">
        {detectedMultiFiles && (
          <div className="mb-4">
            <ArtifactViewer files={detectedMultiFiles} title="Archivos del Proyecto" />
          </div>
        )}

        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            code({ node, inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '');
              const codeString = String(children).replace(/\n$/, '');

              // Verificar si es bloque matemático inline o display
              if (className?.includes('math-inline')) {
                return <SafeKaTeX math={codeString} inline={true} />;
              }
              if (className?.includes('math-display')) {
                return <SafeKaTeX math={codeString} inline={false} />;
              }

              if (!inline && match) {
                return (
                  <CodeBlock
                    language={match[1]}
                    value={codeString}
                  />
                );
              } else if (!inline && codeString.includes('\n')) {
                return (
                  <CodeBlock
                    language=""
                    value={codeString}
                  />
                );
              }

              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-neutral-200/70 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-mono text-xs"
                  {...props}
                >
                  {children}
                </code>
              );
            },
            table({ children }) {
              return (
                <div className="my-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
                  <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800 text-xs sm:text-sm">
                    {children}
                  </table>
                </div>
              );
            },
            th({ children }) {
              return (
                <th className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800/60 text-left font-semibold text-neutral-900 dark:text-neutral-100">
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td className="px-3 py-2 border-t border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300">
                  {children}
                </td>
              );
            },
            a({ href, children }) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2 hover:text-emerald-700 font-medium"
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {sanitizedContent}
        </ReactMarkdown>
      </div>
    </SafeErrorBoundary>
  );
};

// Syntax Highlighted Code Block Subcomponent
interface CodeBlockProps {
  language: string;
  value: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const highlightedHtml = useMemo(() => {
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(value, { language }).value;
      }
      return hljs.highlightAuto(value).value;
    } catch {
      return value;
    }
  }, [value, language]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-neutral-700/60 bg-[#1e1e1e] text-neutral-100 shadow-md">
      {/* Code Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] text-xs text-neutral-400 border-b border-neutral-700/50">
        <span className="font-mono lowercase text-neutral-300 font-medium">
          {language || 'código'}
        </span>
        <button
          type="button"
          onClick={handleCopyCode}
          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar código</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <div className="p-4 overflow-x-auto font-mono text-xs sm:text-sm leading-relaxed">
        <pre className="!bg-transparent !p-0 !m-0">
          <code
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            className="hljs"
          />
        </pre>
      </div>
    </div>
  );
};

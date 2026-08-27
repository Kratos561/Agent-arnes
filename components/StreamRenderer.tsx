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

  useEffect(() => {
    if (!isStreaming) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setDebouncedContent(content);
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedContent(content);
    }, 24);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [content, isStreaming]);

  const sanitizedContent = useMemo(() => {
    const rawToRender = isStreaming ? debouncedContent : content;
    return sanitizeMathDelimiters(rawToRender);
  }, [debouncedContent, content, isStreaming]);

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
    <SafeErrorBoundary fallbackText="Error al renderizar el formato Markdown.">
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

              if (className?.includes('math-inline')) {
                return <SafeKaTeX math={codeString} inline={true} />;
              }
              if (className?.includes('math-display')) {
                return <SafeKaTeX math={codeString} inline={false} />;
              }

              if (!inline && match) {
                return <CodeBlock language={match[1]} value={codeString} />;
              } else if (!inline && codeString.includes('\n')) {
                return <CodeBlock language="" value={codeString} />;
              }

              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-neutral-200/70 dark:bg-neutral-800 text-accent font-mono text-[0.85em] font-medium"
                  {...props}
                >
                  {children}
                </code>
              );
            },
            table({ children }) {
              return (
                <div className="my-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
                  <table className="min-w-full text-xs sm:text-sm">
                    {children}
                  </table>
                </div>
              );
            },
            th({ children }) {
              return (
                <th className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800/60 text-left font-semibold text-neutral-900 dark:text-neutral-100 border-b-2 border-neutral-200 dark:border-neutral-700">
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
            blockquote({ children }) {
              return (
                <blockquote className="my-3 pl-4 border-l-[3px] border-accent bg-accent-soft/50 rounded-r-lg py-2 pr-3 text-neutral-600 dark:text-neutral-400 italic">
                  {children}
                </blockquote>
              );
            },
            a({ href, children }) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline underline-offset-2 decoration-accent/40 hover:decoration-accent font-medium transition-colors"
                >
                  {children}
                </a>
              );
            },
            h2({ children }) {
              return (
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mt-6 mb-3 pb-2 border-b border-neutral-200 dark:border-neutral-800 tracking-tight">
                  {children}
                </h2>
              );
            },
            h3({ children }) {
              return (
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mt-5 mb-2 tracking-tight">
                  {children}
                </h3>
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

/* ===== Code Block — DeepSeek Codex Style ===== */
interface CodeBlockProps {
  language: string;
  value: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);
  const lines = value.split('\n');
  const lineCount = lines.length;

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

  const langDisplay = language || 'code';

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <div className="flex items-center gap-2">
          <span className="code-block-lang">{langDisplay}</span>
          {lineCount > 1 && (
            <span className="text-[10px] text-neutral-500 font-mono">
              {lineCount} lineas
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopyCode}
          className={`code-block-copy ${copied ? 'copied' : ''}`}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>

      <div className="code-block-body">
        {lineCount > 1 && (
          <div className="code-line-numbers">
            {lines.map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        )}
        <pre>
          <code
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            className="hljs"
          />
        </pre>
      </div>
    </div>
  );
};

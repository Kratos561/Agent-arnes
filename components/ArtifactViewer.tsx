'use client';

import React, { useState, useMemo } from 'react';
import hljs from 'highlight.js';
import { 
  Check, 
  Copy, 
  Download, 
  FileCode, 
  FolderTree, 
  Layers, 
  Maximize2, 
  Minimize2 
} from 'lucide-react';

export interface CodeArtifactFile {
  filename: string;
  language: string;
  content: string;
}

interface ArtifactViewerProps {
  files: CodeArtifactFile[];
  title?: string;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ files, title = 'Artefacto Multi-archivo' }) => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const activeFile = files[activeFileIndex] || files[0];

  const highlightedHtml = useMemo(() => {
    if (!activeFile?.content) return '';
    try {
      if (activeFile.language && hljs.getLanguage(activeFile.language)) {
        return hljs.highlight(activeFile.content, { language: activeFile.language }).value;
      }
      return hljs.highlightAuto(activeFile.content).value;
    } catch {
      return activeFile.content;
    }
  }, [activeFile]);

  const handleCopyCode = () => {
    if (!activeFile?.content) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = () => {
    if (!activeFile?.content) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFile.filename || `artifact-${activeFileIndex + 1}.${activeFile.language || 'txt'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!files || files.length === 0) return null;

  return (
    <div
      className={`my-4 rounded-xl border border-neutral-700/60 bg-[#1e1e1e] text-neutral-100 shadow-lg overflow-hidden transition-all ${
        isFullscreen ? 'fixed inset-4 z-50 flex flex-col bg-[#1e1e1e]' : 'w-full'
      }`}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#252526] border-b border-neutral-800 text-xs">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-neutral-200">{title}</span>
          <span className="px-1.5 py-0.5 rounded-full bg-neutral-700/80 text-[10px] text-neutral-300">
            {files.length} {files.length === 1 ? 'archivo' : 'archivos'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
            title="Copiar contenido"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadFile}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
            title="Descargar archivo"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Descargar</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Tabs / File Explorer Bar */}
      {files.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1.5 bg-[#181818] border-b border-neutral-800/80 overflow-x-auto no-scrollbar">
          <FolderTree className="w-3.5 h-3.5 text-neutral-500 ml-1 mr-1 flex-shrink-0" />
          {files.map((file, idx) => {
            const isActive = idx === activeFileIndex;
            return (
              <button
                key={`${file.filename}-${idx}`}
                type="button"
                onClick={() => setActiveFileIndex(idx)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-[#2d2d2d] text-white shadow-xs font-medium border-t-2 border-emerald-500'
                    : 'text-neutral-400 hover:bg-[#252526] hover:text-neutral-200'
                }`}
              >
                <FileCode className="w-3 h-3 text-emerald-400/80" />
                <span>{file.filename}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Code Viewer Body */}
      <div className={`p-4 overflow-x-auto font-mono text-xs sm:text-sm leading-relaxed ${isFullscreen ? 'flex-1 overflow-y-auto' : 'max-h-[550px] overflow-y-auto'}`}>
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

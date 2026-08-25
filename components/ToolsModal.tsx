'use client';

import React, { useMemo, useState } from 'react';
import { Braces, CheckCircle2, Clock3, Copy, FileCode2, Hash, Link, ShieldCheck, Wrench, X } from 'lucide-react';

type ToolId = 'json' | 'base64-encode' | 'base64-decode' | 'url-encode' | 'url-decode' | 'sha256' | 'tokens' | 'timestamp';

const tools: Array<{ id: ToolId; label: string; description: string; icon: typeof Braces; needsInput?: boolean }> = [
  { id: 'json', label: 'JSON', description: 'Valida y formatea JSON', icon: Braces, needsInput: true },
  { id: 'base64-encode', label: 'Base64 →', description: 'Codifica texto UTF-8', icon: FileCode2, needsInput: true },
  { id: 'base64-decode', label: 'Base64 ←', description: 'Decodifica texto UTF-8', icon: FileCode2, needsInput: true },
  { id: 'url-encode', label: 'URL →', description: 'Escapa una URL o parámetro', icon: Link, needsInput: true },
  { id: 'url-decode', label: 'URL ←', description: 'Restaura texto escapado', icon: Link, needsInput: true },
  { id: 'sha256', label: 'SHA-256', description: 'Calcula un hash local', icon: ShieldCheck, needsInput: true },
  { id: 'tokens', label: 'Tokens', description: 'Estimación rápida del texto', icon: Hash, needsInput: true },
  { id: 'timestamp', label: 'Hora', description: 'Marca de tiempo ISO local', icon: Clock3 },
];

function utf8ToBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToUtf8(value: string) {
  const binary = atob(value.trim());
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export const ToolsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [selected, setSelected] = useState<ToolId>('json');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const active = useMemo(() => tools.find((tool) => tool.id === selected)!, [selected]);

  if (!isOpen) return null;

  const execute = async () => {
    setError('');
    try {
      switch (selected) {
        case 'json': setOutput(JSON.stringify(JSON.parse(input), null, 2)); break;
        case 'base64-encode': setOutput(utf8ToBase64(input)); break;
        case 'base64-decode': setOutput(base64ToUtf8(input)); break;
        case 'url-encode': setOutput(encodeURIComponent(input)); break;
        case 'url-decode': setOutput(decodeURIComponent(input)); break;
        case 'sha256': {
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
          setOutput(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''));
          break;
        }
        case 'tokens': setOutput(`≈ ${Math.ceil(input.trim().length / 4)} tokens\n${input.length} caracteres\n${input.trim() ? input.trim().split(/\s+/).length : 0} palabras`); break;
        case 'timestamp': setOutput(`${new Date().toISOString()}\n${new Date().toLocaleString('es-ES')}`); break;
      }
    } catch (reason) {
      setOutput('');
      setError(reason instanceof Error ? reason.message : 'No se pudo procesar la entrada.');
    }
  };

  const changeTool = (id: ToolId) => { setSelected(id); setOutput(''); setError(''); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1e1e1e] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-5 py-4">
          <div className="flex gap-3 items-center"><div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Wrench className="w-5 h-5" /></div><div><h2 className="font-semibold">Herramientas locales</h2><p className="text-xs text-neutral-500">Se ejecutan en tu navegador; no envían el contenido a Agent Arnes.</p></div></div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 min-h-0 flex-1 overflow-hidden">
          <div className="p-3 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 overflow-y-auto grid grid-cols-2 md:block gap-1">
            {tools.map((tool) => { const Icon = tool.icon; return <button key={tool.id} onClick={() => changeTool(tool.id)} className={`w-full text-left p-2.5 rounded-xl transition-colors ${selected === tool.id ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}><span className="flex items-center gap-2 text-sm font-medium"><Icon className="w-4 h-4" />{tool.label}</span><span className="block mt-1 text-[11px] opacity-70">{tool.description}</span></button>; })}
          </div>
          <div className="md:col-span-2 p-5 overflow-y-auto space-y-3">
            <div><h3 className="font-semibold">{active.label}</h3><p className="text-xs text-neutral-500">{active.description}</p></div>
            {active.needsInput && <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Pega o escribe el contenido…" rows={9} className="w-full resize-y rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />}
            <button onClick={execute} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium text-white"><Wrench className="w-4 h-4" />Ejecutar localmente</button>
            {error && <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
            {output && <div className="relative rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-3"><button onClick={() => navigator.clipboard.writeText(output)} className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800" title="Copiar resultado"><Copy className="w-4 h-4" /></button><pre className="whitespace-pre-wrap break-words pr-8 text-xs font-mono">{output}</pre></div>}
            <p className="flex gap-2 text-xs text-neutral-500"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />No hay ejecución de shell, acceso a archivos ni rutas API en el sitio publicado.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

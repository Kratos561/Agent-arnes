'use client';

import React, { useMemo, useState } from 'react';
import {
  Braces,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  FileCode2,
  FileSpreadsheet,
  Fingerprint,
  Hash,
  KeyRound,
  Link,
  Regex,
  ShieldCheck,
  Sigma,
  Wrench,
  X,
} from 'lucide-react';
import {
  evaluateMath,
  testRegex,
  lineDiff,
  runSQL,
  decodeJWT,
  csvToJSON,
  jsonToCSV,
  generateUUIDs,
} from '@/lib/tool-engine';

type ToolId =
  | 'json'
  | 'sql'
  | 'regex'
  | 'diff'
  | 'math'
  | 'base64-encode'
  | 'base64-decode'
  | 'url-encode'
  | 'url-decode'
  | 'sha256'
  | 'tokens'
  | 'timestamp'
  | 'uuid'
  | 'jwt'
  | 'csv-json';

interface ToolDef {
  id: ToolId;
  label: string;
  description: string;
  icon: typeof Braces;
}

const tools: ToolDef[] = [
  { id: 'json', label: 'JSON', description: 'Valida y formatea JSON', icon: Braces },
  { id: 'sql', label: 'SQL', description: 'Mini motor relacional en memoria', icon: Database },
  { id: 'regex', label: 'RegEx', description: 'Prueba una expresión regular', icon: Regex },
  { id: 'diff', label: 'Diff', description: 'Compara dos textos (líneas)', icon: FileCode2 },
  { id: 'math', label: 'Fórmulas', description: 'Evaluador matemático seguro', icon: Sigma },
  { id: 'csv-json', label: 'CSV ↔ JSON', description: 'Convierte entre formatos', icon: FileSpreadsheet },
  { id: 'base64-encode', label: 'Base64 →', description: 'Codifica texto UTF-8', icon: FileCode2 },
  { id: 'base64-decode', label: 'Base64 ←', description: 'Decodifica texto UTF-8', icon: FileCode2 },
  { id: 'url-encode', label: 'URL →', description: 'Escapa una URL o parámetro', icon: Link },
  { id: 'url-decode', label: 'URL ←', description: 'Restaura texto escapado', icon: Link },
  { id: 'sha256', label: 'SHA-256', description: 'Calcula un hash local', icon: ShieldCheck },
  { id: 'tokens', label: 'Tokens', description: 'Estimación rápida del texto', icon: Hash },
  { id: 'uuid', label: 'UUID', description: 'Genera identificadores v4', icon: Fingerprint },
  { id: 'jwt', label: 'JWT', description: 'Decodifica header y payload', icon: KeyRound },
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

const EXAMPLES: Partial<Record<ToolId, Record<string, string>>> = {
  json: {
    input: '{"nombre":"Ada","edad":36,"activa":true}',
  },
  sql: {
    input:
      'CREATE TABLE empleados(nombre TEXT, edad INT, dept TEXT);\nINSERT INTO empleados VALUES ("Ana", 30, "IT");\nINSERT INTO empleados VALUES ("Luis", 42, "Finanzas");\nINSERT INTO empleados VALUES ("Sofía", 25, "IT");\nSELECT * FROM empleados WHERE dept = \'IT\' ORDER BY edad DESC;',
  },
  regex: {
    pattern: '\\b\\w+@\\w+\\.\\w+\\b',
    flags: 'g',
    input: 'Contacta a ana@correo.com o a luis@mail.es hoy.',
  },
  diff: {
    a: 'hola mundo\nprimera línea\nfin',
    b: 'hola mundo\nprimera línea modificada\nnueva línea\nfin',
  },
  math: {
    input: '(2 + 3) * 4 ^ 2 - sqrt(144) + min(10, 20, 5)',
  },
  'csv-json': {
    input: 'nombre,edad,ciudad\nAna,30,Madrid\nLuis,42,Sevilla\nSofía,25,Valencia',
  },
  uuid: {
    uuid: '5',
  },
  jwt: {
    input: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSIsImlhdCI6MTUxNjIzOTAyMn0.placeholder',
  },
};

export const ToolsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [selected, setSelected] = useState<ToolId>('json');
  const [input, setInput] = useState('');
  const [altInput, setAltInput] = useState('');
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('');
  const [extra, setExtra] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const active = useMemo(() => tools.find((tool) => tool.id === selected)!, [selected]);

  if (!isOpen) return null;

  const fillExample = () => {
    const ex = EXAMPLES[selected] as Record<string, string> | undefined;
    if (!ex) return;
    const nextInput = ex.input ?? ex.b ?? input;
    const nextAlt = ex.altInput ?? ex.a ?? altInput;
    const nextPattern = ex.pattern ?? pattern;
    const nextFlags = ex.flags ?? flags;
    const nextExtra = ex.uuid ?? ex.count ?? extra;
    setInput(nextInput);
    setAltInput(nextAlt);
    setPattern(nextPattern);
    setFlags(nextFlags);
    setExtra(nextExtra);
  };

  const execute = async () => {
    setError('');
    setOutput('');
    try {
      switch (selected) {
        case 'json':
          setOutput(JSON.stringify(JSON.parse(input), null, 2));
          break;
        case 'math': {
          const res = evaluateMath(input);
          if (!res.ok) throw new Error(res.error || 'Expresión inválida');
          setOutput(`Resultado: ${res.value}`);
          break;
        }
        case 'regex':
          setOutput(testRegex(pattern, flags, input));
          break;
        case 'diff':
          setOutput(lineDiff(altInput, input));
          break;
        case 'sql':
          setOutput(runSQL(input));
          break;
        case 'csv-json': {
          const delimiter = extra || ',';
          const lower = input.trim().toLowerCase();
          if (lower.startsWith('[') || lower.startsWith('{')) {
            setOutput(`CSV:\n${jsonToCSV(input)}`);
          } else {
            setOutput(`JSON:\n${csvToJSON(input, delimiter)}`);
          }
          break;
        }
        case 'base64-encode': setOutput(utf8ToBase64(input)); break;
        case 'base64-decode': setOutput(base64ToUtf8(input)); break;
        case 'url-encode': setOutput(encodeURIComponent(input)); break;
        case 'url-decode': setOutput(decodeURIComponent(input)); break;
        case 'sha256': {
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
          setOutput(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''));
          break;
        }
        case 'tokens':
          setOutput(`≈ ${Math.ceil(input.trim().length / 4)} tokens\n${input.length} caracteres\n${input.trim() ? input.trim().split(/\s+/).length : 0} palabras`);
          break;
        case 'uuid': {
          const count = Math.min(50, Math.max(1, parseInt(extra || '1', 10) || 1));
          setOutput(generateUUIDs(count, flags.includes('u')).join('\n'));
          break;
        }
        case 'jwt': setOutput(decodeJWT(input)); break;
        case 'timestamp': setOutput(`${new Date().toISOString()}\n${new Date().toLocaleString('es-ES')}`); break;
      }
    } catch (reason) {
      setOutput('');
      setError(reason instanceof Error ? reason.message : 'No se pudo procesar la entrada.');
    }
  };

  const changeTool = (id: ToolId) => {
    setSelected(id);
    setOutput('');
    setError('');
  };

  const hasPrimary = selected === 'json' || selected === 'sql' || selected === 'regex' || selected === 'diff'
    || selected === 'math' || selected === 'csv-json' || selected === 'base64-encode'
    || selected === 'base64-decode' || selected === 'url-encode' || selected === 'url-decode'
    || selected === 'sha256' || selected === 'tokens' || selected === 'jwt';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1e1e1e] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-5 py-4">
          <div className="flex gap-3 items-center">
            <div className="p-2 rounded-lg bg-accent text-accent/90"><Wrench className="w-5 h-5" /></div>
            <div>
              <h2 className="font-semibold">Suite de herramientas locales</h2>
              <p className="text-xs text-neutral-500">Se ejecutan 100% en tu navegador; no envían contenido a ningún servidor.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 min-h-0 flex-1 overflow-hidden">
          {/* Tool list */}
          <div className="p-3 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 overflow-y-auto grid grid-cols-2 md:grid-cols-1 gap-1 content-start">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => changeTool(tool.id)}
                  className={`w-full text-left p-2.5 rounded-xl transition-colors ${
                    selected === tool.id
                      ? 'bg-accent text-white'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium"><Icon className="w-4 h-4" />{tool.label}</span>
                  <span className={`block mt-1 text-[11px] ${selected === tool.id ? 'opacity-80' : 'opacity-70'}`}>{tool.description}</span>
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div className="md:col-span-2 p-5 overflow-y-auto space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><active.icon className="w-4 h-4 text-accent" />{active.label}</h3>
                <p className="text-xs text-neutral-500">{active.description}</p>
              </div>
              {EXAMPLES[selected] && (
                <button type="button" onClick={fillExample} className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                  Cargar ejemplo
                </button>
              )}
            </div>

            {/* Custom inputs per tool */}
            {selected === 'diff' && (
              <div className="grid grid-cols-1 gap-3">
                <textarea value={altInput} onChange={(e) => setAltInput(e.target.value)} placeholder="Texto A (original)…" rows={5} className="w-full resize-y rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
                <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Texto B (nuevo)…" rows={5} className="w-full resize-y rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
              </div>
            )}

            {selected === 'regex' && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Expresión regular (ej: \\d+)" className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
                  <input value={flags} onChange={(e) => setFlags(e.target.value)} placeholder="flags (gim)" className="w-20 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent p-3 font-mono text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
                <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Texto sobre el que aplicar la expresión…" rows={6} className="w-full resize-y rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
              </div>
            )}

            {hasPrimary && selected !== 'diff' && selected !== 'regex' && (
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pega o escribe el contenido…"
                rows={selected === 'sql' ? 10 : 8}
                className="w-full resize-y rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            )}

            {selected === 'uuid' && (
              <input
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="Cantidad (1-50)"
                type="number"
                min={1}
                max={50}
                className="w-40 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            )}

            {selected === 'csv-json' && (
              <input
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="Delimitador (default ,)"
                className="w-40 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            )}

            <div className="flex items-center gap-2">
              <button onClick={execute} className="inline-flex items-center gap-2 rounded-xl bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium text-white shadow-sm"><Wrench className="w-4 h-4" />Ejecutar localmente</button>
              <span className="text-[11px] text-neutral-400">Sin shell, sin archivos, sin servidor.</span>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">{error}</div>
            )}
            {output && (
              <div className="relative rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-3">
                <button onClick={() => navigator.clipboard.writeText(output)} className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800" title="Copiar resultado"><Copy className="w-4 h-4" /></button>
                <pre className="whitespace-pre-wrap break-words pr-8 text-xs font-mono">{output}</pre>
              </div>
            )}
            <p className="flex gap-2 text-xs text-neutral-500">
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
              La provisión local es solo de navegador: nada de esto se sube ni deja tu máquina.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Trash2, ToggleLeft, ToggleRight, Sparkles, Upload, FileText, Clipboard } from 'lucide-react';
import { AgentSkill, skillFromSkillMd, skillToSkillMd } from '@/lib/agent-infra';

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  skills: AgentSkill[];
  onSaveSkills: (skills: AgentSkill[]) => void;
}

export const SkillsModal: React.FC<SkillsModalProps> = ({ isOpen, onClose, skills, onSaveSkills }) => {
  const [localSkills, setLocalSkills] = useState<AgentSkill[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [parseError, setParseError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalSkills([...skills]);
      setExpandedId(null);
      setPasteMode(false);
      setPasteContent('');
      setParseError('');
    }
  }, [isOpen, skills]);

  if (!isOpen) return null;

  const handleToggle = (id: string) =>
    setLocalSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled, updatedAt: Date.now() } : s)));

  const handleDelete = (id: string) =>
    setLocalSkills((prev) => prev.filter((s) => s.id !== id));

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setParseError('');

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const skill = skillFromSkillMd(content);
        if (skill) {
          setLocalSkills((prev) => [...prev, skill]);
        } else {
          setParseError(`No se pudo parsear: ${file.name}. Asegurate de que sea un SKILL.md valido con frontmatter YAML (---).`);
        }
      };
      reader.readAsText(file);
    });

    e.target.value = '';
  }, []);

  const handlePasteImport = () => {
    setParseError('');
    const skill = skillFromSkillMd(pasteContent);
    if (skill) {
      setLocalSkills((prev) => [...prev, skill]);
      setPasteContent('');
      setPasteMode(false);
    } else {
      setParseError('No se pudo parsear. Formato esperado:\n---\nname: skill-name\ndescription: Cuando usar...\n---\n\nInstrucciones markdown...');
    }
  };

  const handleExport = (skill: AgentSkill) => {
    const md = skillToSkillMd(skill);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = () => {
    onSaveSkills(localSkills);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-[#1e1e1e] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Skills (SKILL.md)</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Carga archivos .md con frontmatter YAML.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {localSkills.length === 0 && (
            <div className="text-center py-8 text-neutral-400 text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No hay skills cargados.</p>
              <p className="text-xs mt-1">Sube un archivo .md o pega el contenido de un SKILL.md.</p>
            </div>
          )}

          {localSkills.map((skill) => (
            <div
              key={skill.id}
              className={`p-3 rounded-xl border transition-all ${
                skill.enabled
                  ? 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#232323]'
                  : 'border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-[#1a1a1a] opacity-60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button type="button" onClick={() => handleToggle(skill.id)} className="flex-shrink-0">
                    {skill.enabled ? <ToggleRight className="w-5 h-5 text-purple-500" /> : <ToggleLeft className="w-5 h-5 text-neutral-400" />}
                  </button>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 block truncate">{skill.name}</span>
                    <span className="text-[11px] text-neutral-400 block truncate">{skill.description}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button type="button" onClick={() => setExpandedId(expandedId === skill.id ? null : skill.id)} className="px-2 py-1 text-[11px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors">
                    {expandedId === skill.id ? 'Colapsar' : 'Ver'}
                  </button>
                  <button type="button" onClick={() => handleExport(skill)} className="px-2 py-1 text-[11px] text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition-colors" title="Exportar como .md">
                    .md
                  </button>
                  <button type="button" onClick={() => handleDelete(skill.id)} className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {expandedId === skill.id && (
                <div className="mt-3 ml-7 p-3 rounded-lg bg-neutral-50 dark:bg-[#141414] border border-neutral-100 dark:border-neutral-800">
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {skill.instructions}
                  </p>
                  {skill.triggers.length > 0 && (
                    <div className="mt-2 flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-neutral-400">Triggers:</span>
                      {skill.triggers.map((t, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-500">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {pasteMode ? (
            <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-50/30 dark:bg-purple-950/20 space-y-3">
              <textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder={'---\nname: mi-skill\ndescription: Cuando usar este skill...\n---\n\n## Instrucciones\n\nEscribe aqui las instrucciones...'}
                rows={10}
                className="w-full p-3 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono leading-relaxed"
              />
              {parseError && <p className="text-xs text-red-500">{parseError}</p>}
              <div className="flex items-center gap-2 justify-end">
                <button type="button" onClick={() => { setPasteMode(false); setPasteContent(''); setParseError(''); }} className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">Cancelar</button>
                <button type="button" onClick={handlePasteImport} disabled={!pasteContent.trim()} className="px-3 py-1.5 text-xs font-medium bg-purple-500 text-white rounded-lg disabled:opacity-40">Importar SKILL.md</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex-1 p-3 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-purple-500 hover:border-purple-500/50 transition-colors flex items-center justify-center gap-2 text-xs font-medium">
                <Upload className="w-4 h-4" /> Subir archivo .md
              </button>
              <button type="button" onClick={() => setPasteMode(true)} className="flex-1 p-3 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-purple-500 hover:border-purple-500/50 transition-colors flex items-center justify-center gap-2 text-xs font-medium">
                <Clipboard className="w-4 h-4" /> Pegar SKILL.md
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" multiple className="hidden" onChange={handleFileUpload} />
        </div>

        <div className="px-6 py-3.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50 flex items-center justify-between">
          <span className="text-[11px] text-neutral-400">{localSkills.filter((s) => s.enabled).length} de {localSkills.length} skills activas</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3.5 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors">Cancelar</button>
            <button type="button" onClick={handleSave} className="px-4 py-2 text-xs font-semibold rounded-xl bg-purple-500 text-white hover:bg-purple-600 transition-colors">Guardar Skills</button>
          </div>
        </div>
      </div>
    </div>
  );
};

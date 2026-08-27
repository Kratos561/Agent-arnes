'use client';

import React, { useState } from 'react';
import { X, Trash2, ToggleLeft, ToggleRight, Sparkles, Zap, Code, PenTool, BarChart3, Palette } from 'lucide-react';
import { AgentSkill } from '@/lib/agent-infra';
import { createId } from '@/lib/utils';

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  skills: AgentSkill[];
  onSaveSkills: (skills: AgentSkill[]) => void;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  coding: { label: 'Programacion', icon: Code, color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/40' },
  writing: { label: 'Escritura', icon: PenTool, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' },
  analysis: { label: 'Analisis', icon: BarChart3, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40' },
  creative: { label: 'Creativo', icon: Palette, color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/40' },
  custom: { label: 'Personalizado', icon: Zap, color: 'text-pink-500 bg-pink-50 dark:bg-pink-950/40' },
};

export const SkillsModal: React.FC<SkillsModalProps> = ({ isOpen, onClose, skills, onSaveSkills }) => {
  const [localSkills, setLocalSkills] = useState<AgentSkill[]>([...skills]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newSkill, setNewSkill] = useState({ name: '', description: '', instructions: '', icon: '\u26A1', category: 'custom' as AgentSkill['category'], triggers: '' });

  if (!isOpen) return null;

  const handleToggle = (id: string) => setLocalSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled, updatedAt: Date.now() } : s)));
  const handleDelete = (id: string) => setLocalSkills((prev) => prev.filter((s) => s.id !== id));

  const handleAddSkill = () => {
    if (!newSkill.name.trim() || !newSkill.instructions.trim()) return;
    const skill: AgentSkill = {
      id: createId('skill'), name: newSkill.name.trim(), description: newSkill.description.trim(),
      instructions: newSkill.instructions.trim(), enabled: true, icon: newSkill.icon || '\u26A1',
      category: newSkill.category, triggers: newSkill.triggers.split(',').map((t) => t.trim()).filter(Boolean),
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    setLocalSkills((prev) => [...prev, skill]);
    setNewSkill({ name: '', description: '', instructions: '', icon: '\u26A1', category: 'custom', triggers: '' });
    setIsAdding(false);
  };

  const handleSave = () => { onSaveSkills(localSkills); onClose(); };

  const grouped = localSkills.reduce((acc, s) => { (acc[s.category] = acc[s.category] || []).push(s); return acc; }, {} as Record<string, AgentSkill[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-[#1e1e1e] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center"><Sparkles className="w-4 h-4" /></div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Skills del Agente</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Instrucciones especializadas que se cargan por contexto.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {Object.entries(grouped).map(([category, catSkills]) => {
            const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.custom;
            const Icon = config.icon;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1 rounded ${config.color}`}><Icon className="w-3.5 h-3.5" /></div>
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{config.label}</span>
                  <span className="text-[10px] text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">{catSkills.filter((s) => s.enabled).length}/{catSkills.length} activas</span>
                </div>
                <div className="space-y-1.5">
                  {catSkills.map((skill) => (
                    <div key={skill.id} className={`p-3 rounded-xl border transition-all ${skill.enabled ? 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#232323]' : 'border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-[#1a1a1a] opacity-60'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <button type="button" onClick={() => handleToggle(skill.id)} className="flex-shrink-0">
                            {skill.enabled ? <ToggleRight className="w-5 h-5 text-accent" /> : <ToggleLeft className="w-5 h-5 text-neutral-400" />}
                          </button>
                          <span className="text-lg flex-shrink-0">{skill.icon}</span>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 block truncate">{skill.name}</span>
                            <span className="text-[11px] text-neutral-400 block truncate">{skill.description}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button type="button" onClick={() => setExpandedId(expandedId === skill.id ? null : skill.id)} className="px-2 py-1 text-[11px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors">
                            {expandedId === skill.id ? 'Colapsar' : 'Ver'}
                          </button>
                          {!skill.id.startsWith('skill-') && (
                            <button type="button" onClick={() => handleDelete(skill.id)} className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </div>
                      {expandedId === skill.id && (
                        <div className="mt-3 ml-7 p-3 rounded-lg bg-neutral-50 dark:bg-[#141414] border border-neutral-100 dark:border-neutral-800">
                          <p className="text-xs text-neutral-600 dark:text-neutral-400 font-mono whitespace-pre-wrap leading-relaxed">{skill.instructions}</p>
                          {skill.triggers.length > 0 && (
                            <div className="mt-2 flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-neutral-400">Triggers:</span>
                              {skill.triggers.map((t, i) => (<span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-500">{t}</span>))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {isAdding ? (
            <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-50/30 dark:bg-purple-950/20 space-y-3">
              <div className="flex items-center gap-2">
                <input type="text" value={newSkill.icon} onChange={(e) => setNewSkill((p) => ({ ...p, icon: e.target.value }))} className="w-10 text-center text-lg rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414]" placeholder="Icon" />
                <input type="text" value={newSkill.name} onChange={(e) => setNewSkill((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre del skill" className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                <select value={newSkill.category} onChange={(e) => setNewSkill((p) => ({ ...p, category: e.target.value as AgentSkill['category'] }))} className="px-2 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100">
                  <option value="coding">Programacion</option><option value="writing">Escritura</option><option value="analysis">Analisis</option><option value="creative">Creativo</option><option value="custom">Personalizado</option>
                </select>
              </div>
              <input type="text" value={newSkill.description} onChange={(e) => setNewSkill((p) => ({ ...p, description: e.target.value }))} placeholder="Descripcion corta" className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500" />
              <textarea value={newSkill.instructions} onChange={(e) => setNewSkill((p) => ({ ...p, instructions: e.target.value }))} placeholder="Instrucciones detalladas del skill..." rows={5} className="w-full p-2.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono leading-relaxed" />
              <input type="text" value={newSkill.triggers} onChange={(e) => setNewSkill((p) => ({ ...p, triggers: e.target.value }))} placeholder="Triggers (separados por coma)" className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500" />
              <div className="flex items-center gap-2 justify-end">
                <button type="button" onClick={() => setIsAdding(false)} className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">Cancelar</button>
                <button type="button" onClick={handleAddSkill} disabled={!newSkill.name.trim() || !newSkill.instructions.trim()} className="px-3 py-1.5 text-xs font-medium bg-purple-500 text-white rounded-lg disabled:opacity-40">Agregar Skill</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setIsAdding(true)} className="w-full p-3 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-purple-500 hover:border-purple-500/50 transition-colors flex items-center justify-center gap-2 text-xs font-medium">
              <Zap className="w-4 h-4" /> Agregar Skill Personalizado
            </button>
          )}
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
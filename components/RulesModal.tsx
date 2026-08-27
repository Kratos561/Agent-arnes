'use client';

import React, { useState } from 'react';
import { X, Plus, Trash2, ToggleLeft, ToggleRight, Shield, Zap, FileText, Tag, Save } from 'lucide-react';
import { AgentRule } from '@/lib/agent-infra';
import { createId } from '@/lib/utils';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: AgentRule[];
  onSaveRules: (rules: AgentRule[]) => void;
}

const CATEGORY_CONFIG = {
  behavior: { label: 'Comportamiento', icon: Zap, color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/40' },
  output: { label: 'Salida', icon: FileText, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' },
  safety: { label: 'Seguridad', icon: Shield, color: 'text-red-500 bg-red-50 dark:bg-red-950/40' },
  custom: { label: 'Personalizada', icon: Tag, color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/40' },
};

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  rules,
  onSaveRules,
}) => {
  const [localRules, setLocalRules] = useState<AgentRule[]>([...rules]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', content: '', category: 'custom' as AgentRule['category'] });

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    setLocalRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled, updatedAt: Date.now() } : r))
    );
  };

  const handleDelete = (id: string) => {
    setLocalRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleStartEdit = (rule: AgentRule) => {
    setEditingId(rule.id);
    setEditContent(rule.content);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    setLocalRules((prev) =>
      prev.map((r) =>
        r.id === editingId ? { ...r, content: editContent, updatedAt: Date.now() } : r
      )
    );
    setEditingId(null);
    setEditContent('');
  };

  const handleAddRule = () => {
    if (!newRule.name.trim() || !newRule.content.trim()) return;
    const rule: AgentRule = {
      id: createId('rule'),
      name: newRule.name.trim(),
      content: newRule.content.trim(),
      enabled: true,
      scope: 'global',
      category: newRule.category,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setLocalRules((prev) => [...prev, rule]);
    setNewRule({ name: '', content: '', category: 'custom' });
    setIsAdding(false);
  };

  const handleSave = () => {
    onSaveRules(localRules);
    onClose();
  };

  const groupedRules = localRules.reduce(
    (acc, rule) => {
      acc[rule.category] = acc[rule.category] || [];
      acc[rule.category].push(rule);
      return acc;
    },
    {} as Record<string, AgentRule[]>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-[#1e1e1e] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Reglas del Agente
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Define comportamiento, formato de salida y límites del agente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Rules List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {Object.entries(groupedRules).map(([category, catRules]) => {
            const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.custom;
            const Icon = config.icon;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1 rounded ${config.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {config.label}
                  </span>
                  <span className="text-[10px] text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                    {catRules.filter((r) => r.enabled).length}/{catRules.length} activas
                  </span>
                </div>
                <div className="space-y-1.5">
                  {catRules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`p-3 rounded-xl border transition-all ${
                        rule.enabled
                          ? 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#232323]'
                          : 'border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-[#1a1a1a] opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => handleToggle(rule.id)}
                            className="flex-shrink-0"
                            title={rule.enabled ? 'Desactivar' : 'Activar'}
                          >
                            {rule.enabled ? (
                              <ToggleRight className="w-5 h-5 text-accent" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-neutral-400" />
                            )}
                          </button>
                          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {rule.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(rule)}
                            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-xs"
                          >
                            Editar
                          </button>
                          {!rule.id.startsWith('rule-') && (
                            <button
                              type="button"
                              onClick={() => handleDelete(rule.id)}
                              className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {editingId === rule.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full p-2.5 text-xs rounded-lg border border-accent/30 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-accent font-mono leading-relaxed"
                            rows={4}
                          />
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="px-2.5 py-1 text-xs font-medium bg-accent text-white rounded-md"
                            >
                              Guardar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1.5 ml-7 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                          {rule.content}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Add New Rule */}
          {isAdding ? (
            <div className="p-4 rounded-xl border border-accent/30 bg-accent-soft/30 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newRule.name}
                  onChange={(e) => setNewRule((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nombre de la regla"
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <select
                  value={newRule.category}
                  onChange={(e) => setNewRule((p) => ({ ...p, category: e.target.value as AgentRule['category'] }))}
                  className="px-2 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100"
                >
                  <option value="behavior">Comportamiento</option>
                  <option value="output">Salida</option>
                  <option value="safety">Seguridad</option>
                  <option value="custom">Personalizada</option>
                </select>
              </div>
              <textarea
                value={newRule.content}
                onChange={(e) => setNewRule((p) => ({ ...p, content: e.target.value }))}
                placeholder="Contenido de la regla (se inyecta en el system prompt)..."
                rows={3}
                className="w-full p-2.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-accent font-mono leading-relaxed"
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAddRule}
                  disabled={!newRule.name.trim() || !newRule.content.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg disabled:opacity-40"
                >
                  Agregar Regla
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="w-full p-3 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-accent hover:border-accent/50 transition-colors flex items-center justify-center gap-2 text-xs font-medium"
            >
              <Plus className="w-4 h-4" />
              Agregar Regla Personalizada
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50 flex items-center justify-between">
          <span className="text-[11px] text-neutral-400">
            {localRules.filter((r) => r.enabled).length} de {localRules.length} reglas activas
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent text-white hover:bg-accent-hover transition-colors flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              Guardar Reglas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

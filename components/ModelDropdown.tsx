'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronDown, 
  Sparkles, 
  Search, 
  RefreshCw, 
  Check, 
  Sliders, 
  Zap,
  Brain,
  Gift
} from 'lucide-react';
import { ModelInfo, ProviderConfig } from '@/lib/types';
import { fetchModels } from '@/lib/api-client';
import { saveCachedModels } from '@/lib/storage';

interface ModelDropdownProps {
  activeModelId: string;
  provider: ProviderConfig;
  providers?: ProviderConfig[];
  cachedModels: ModelInfo[];
  onSelectModel: (modelId: string) => void;
  onSelectProvider?: (providerId: string) => void;
  onOpenSettings: () => void;
  onModelsUpdated: (models: ModelInfo[]) => void;
}

export const ModelDropdown: React.FC<ModelDropdownProps> = ({
  activeModelId,
  provider,
  providers = [],
  cachedModels,
  onSelectModel,
  onSelectProvider,
  onOpenSettings,
  onModelsUpdated,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleRefreshModels = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetchModels(provider);
      if (res.success && res.models) {
        onModelsUpdated(res.models);
        saveCachedModels(provider.id, res.models);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleApplyCustomModel = () => {
    if (customModelInput.trim()) {
      onSelectModel(customModelInput.trim());
      setCustomModelInput('');
      setIsOpen(false);
    }
  };

  const filteredModels = cachedModels.filter((m) =>
    m.id.toLowerCase().includes(search.toLowerCase()) ||
    (m.name && m.name.toLowerCase().includes(search.toLowerCase()))
  );

  const displayModelName = activeModelId ? activeModelId.split('/').pop() : 'Seleccionar Modelo';

  const getModelBadge = (m: ModelInfo) => {
    const id = m.id.toLowerCase();
    const name = (m.name || '').toLowerCase();
    if (id.includes(':free') || name.includes('gratis') || id.includes('free')) {
      return { label: 'Gratis', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300', icon: Gift };
    }
    if (id.includes('r1') || id.includes('o1') || id.includes('o3') || id.includes('reason') || id.includes('deepseek')) {
      return { label: 'Razonamiento', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300', icon: Brain };
    }
    if (id.includes('flash') || id.includes('lite') || id.includes('mini') || id.includes('small')) {
      return { label: 'Rapido', color: 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300', icon: Zap };
    }
    return null;
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        id="model-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-sm font-semibold transition-all group"
      >
        <span className="text-neutral-900 dark:text-neutral-100 font-semibold tracking-tight truncate max-w-[200px] sm:max-w-[280px]">
          {displayModelName}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-200/80 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-normal">
          {provider.name.split(' ')[0]}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          id="model-dropdown-menu"
          className="absolute left-0 sm:left-auto sm:right-auto mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#1e1e1e] border border-neutral-200 dark:border-neutral-800 shadow-2xl z-50 overflow-hidden"
          style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
          {/* Header */}
          <div className="p-3 border-b border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-[#181818]/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Modelo y Proveedor
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleRefreshModels}
                  disabled={isRefreshing}
                  title="Actualizar modelos"
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-accent' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); onOpenSettings(); }}
                  title="Configurar proveedor"
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Provider Chips */}
            {providers && providers.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-0.5 px-0.5">
                {providers.map((p) => {
                  const isCurrent = p.id === provider.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectProvider && onSelectProvider(p.id)}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-lg whitespace-nowrap transition-all flex items-center gap-1 flex-shrink-0 ${
                        isCurrent
                          ? 'bg-accent text-white shadow-xs'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                      }`}
                    >
                      {p.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="p-2 border-b border-neutral-100 dark:border-neutral-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar modelo..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-800/80 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Models List */}
          <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
            {filteredModels.length > 0 ? (
              filteredModels.map((m) => {
                const isSelected = m.id === activeModelId;
                const badge = getModelBadge(m);
                const BadgeIcon = badge?.icon;

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { onSelectModel(m.id); setIsOpen(false); }}
                    className={`w-full px-3 py-2.5 rounded-xl text-left transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-accent-soft ring-1 ring-accent/30'
                        : 'hover:bg-neutral-50 dark:hover:bg-[#252525]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold text-xs truncate ${
                          isSelected ? 'text-accent' : 'text-neutral-900 dark:text-neutral-100'
                        }`}>
                          {m.name || m.id.split('/').pop()}
                        </span>
                        {badge && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${badge.color}`}>
                            {BadgeIcon && <BadgeIcon className="w-2.5 h-2.5" />}
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
                        {m.id}
                      </div>
                      {m.description && (
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-0.5">
                          {m.description}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="py-8 px-4 text-center">
                <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3">
                  <Search className="w-5 h-5 text-neutral-400" />
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                  {search
                    ? 'No se encontraron modelos.'
                    : 'No hay modelos en cache.'}
                </p>
                <button
                  type="button"
                  onClick={handleRefreshModels}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors shadow-sm"
                >
                  <RefreshCw className="w-3 h-3" />
                  Obtener de la API
                </button>
              </div>
            )}
          </div>

          {/* Custom Model Input */}
          <div className="p-2.5 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyCustomModel()}
                placeholder="ID manual (ej: gpt-4o)..."
                className="flex-1 px-2.5 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-accent font-mono"
              />
              <button
                type="button"
                onClick={handleApplyCustomModel}
                disabled={!customModelInput.trim()}
                className="px-3 py-2 text-xs font-semibold rounded-xl bg-accent text-white disabled:opacity-40 hover:bg-accent-hover transition-colors shadow-sm"
              >
                Usar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

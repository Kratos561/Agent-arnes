'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronDown, 
  Sparkles, 
  Search, 
  RefreshCw, 
  Plus, 
  Check, 
  Sliders, 
  ExternalLink,
  Cpu
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

  // Close dropdown on outside click
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

  // Filtered models
  const filteredModels = cachedModels.filter((m) =>
    m.id.toLowerCase().includes(search.toLowerCase()) ||
    (m.name && m.name.toLowerCase().includes(search.toLowerCase()))
  );

  // Clean active model display name
  const displayModelName = activeModelId ? activeModelId.split('/').pop() : 'Seleccionar Modelo';

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button (ChatGPT top style) */}
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
          className={`w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          id="model-dropdown-menu"
          className="absolute left-0 sm:left-auto sm:right-auto mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#1e1e1e] border border-neutral-200 dark:border-neutral-800 shadow-2xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="p-3 border-b border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-[#181818]/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                Seleccionar Modelo & Proveedor
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleRefreshModels}
                disabled={isRefreshing}
                title="Actualizar lista de modelos desde la API"
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings();
                }}
                title="Configurar Proveedor"
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Provider Chips */}
          {providers && providers.length > 0 && (
            <div className="px-2.5 py-2 border-b border-neutral-100 dark:border-neutral-800/60 bg-neutral-50/20 dark:bg-neutral-900/30 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {providers.map((p) => {
                const isCurrent = p.id === provider.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (onSelectProvider) onSelectProvider(p.id);
                    }}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-lg whitespace-nowrap transition-all flex items-center gap-1 ${
                      isCurrent
                        ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {p.id === 'gemini' ? '✨ Gemini' : p.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Search bar */}
          <div className="p-2 border-b border-neutral-100 dark:border-neutral-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar modelo..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-800/80 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Models List */}
          <div className="max-h-64 overflow-y-auto p-1 space-y-1">
            {filteredModels.length > 0 ? (
              filteredModels.map((m) => {
                const isSelected = m.id === activeModelId;
                const isFree = m.id.includes(':free') || m.name?.includes('Gratis') || m.id.includes('free');
                const isReasoning = m.id.includes('r1') || m.id.includes('o1') || m.id.includes('o3') || m.id.includes('reason');
                
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(m.id);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs transition-colors flex items-center justify-between gap-2 group/item ${
                      isSelected
                        ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium ring-1 ring-emerald-500/30'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#252525]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 truncate">
                          {m.name || m.id.split('/').pop()}
                        </span>
                        {isFree && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 rounded">
                            GRATIS
                          </span>
                        )}
                        {isReasoning && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 rounded">
                            RAZONAMIENTO
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
                      <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="py-6 px-4 text-center">
                <p className="text-xs text-neutral-400 mb-2">
                  {search
                    ? 'No se encontraron modelos con esa búsqueda.'
                    : 'No hay modelos en caché. Pulsa actualizar o ingresa uno manualmente.'}
                </p>
                <button
                  type="button"
                  onClick={handleRefreshModels}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Obtener modelos de la API</span>
                </button>
              </div>
            )}
          </div>

          {/* Custom Model Input */}
          <div className="p-2 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyCustomModel()}
                placeholder="O escribe ID manual (ej: gpt-4o)..."
                className="flex-1 px-2.5 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
              />
              <button
                type="button"
                onClick={handleApplyCustomModel}
                disabled={!customModelInput.trim()}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                Usar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

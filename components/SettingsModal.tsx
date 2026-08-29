'use client';

import React, { useState } from 'react';
import { 
  X, 
  Key, 
  Globe, 
  Server, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  ExternalLink,
  Sliders,
  Layers,
  Search,
  Check
} from 'lucide-react';
import { ProviderConfig, ModelInfo, PRESET_PROVIDERS } from '@/lib/types';
import { fetchModels, diagnoseConnection, DiagnosticAttempt } from '@/lib/api-client';
import { saveCachedModels } from '@/lib/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderConfig[];
  activeProviderId: string;
  onUpdateProviders: (newProviders: ProviderConfig[]) => void;
  onSelectActiveProvider: (id: string) => void;
  onSelectActiveModel: (modelId: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  providers,
  activeProviderId,
  onUpdateProviders,
  onSelectActiveProvider,
  onSelectActiveModel,
}) => {
  const [selectedProviderId, setSelectedProviderId] = useState<string>(activeProviderId);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message?: string;
    models?: ModelInfo[];
    latencyMs?: number;
  }>({ status: 'idle' });
  const [modelSearch, setModelSearch] = useState('');
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<{ target: string; attempts: DiagnosticAttempt[] } | null>(null);

  const flashSaved = () => {
    setShowSavedIndicator(true);
    setTimeout(() => setShowSavedIndicator(false), 2400);
  };

  if (!isOpen) return null;

  const currentProvider = providers.find((p) => p.id === selectedProviderId) || providers[0];

  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    setTestResult({ status: 'idle' });
    setModelSearch('');
  };

  const handleUpdateField = (field: keyof ProviderConfig, value: any) => {
    const updated = providers.map((p) => {
      if (p.id === currentProvider.id) {
        return { ...p, [field]: value };
      }
      return p;
    });
    onUpdateProviders(updated);
  };

  const handleResetBaseUrl = () => {
    const preset = PRESET_PROVIDERS.find((p) => p.id === currentProvider.id);
    if (preset) {
      handleUpdateField('baseUrl', preset.baseUrl);
    }
  };

  const handleTestConnection = async () => {
    if (!currentProvider.baseUrl) {
      setTestResult({
        status: 'error',
        message: 'Por favor, ingresa una URL Base válida.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult({ status: 'idle' });
    const startTime = performance.now();

    try {
      const res = await fetchModels(currentProvider);
      const latency = Math.round(performance.now() - startTime);

      if (res.success) {
        setTestResult({
          status: 'success',
          message: `Conexión exitosa. Se encontraron ${res.models.length} modelos disponibles (${latency}ms)${res.viaProxy ? ' — vía proxy CORS' : ''}.`,
          models: res.models,
          latencyMs: latency,
        });

        // Cache the discovered models
        saveCachedModels(currentProvider.id, res.models);

        // If no default model is set or not in list, set first
        if (res.models.length > 0 && !currentProvider.defaultModel) {
          handleUpdateField('defaultModel', res.models[0].id);
        }
      } else {
        setTestResult({
          status: 'error',
          message: res.error || 'No se pudo conectar al endpoint.',
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 'error',
        message: `Error de red: ${err.message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDiagnose = async () => {
    if (!currentProvider.baseUrl) {
      setTestResult({ status: 'error', message: 'Ingresa una URL Base válida antes de diagnosticar.' });
      return;
    }
    setIsDiagnosing(true);
    setDiagnostics(null);
    try {
      const result = await diagnoseConnection(currentProvider);
      setDiagnostics(result);
    } catch (err: any) {
      setDiagnostics({ target: '', attempts: [{ attempt: 'Error', ok: false, kind: 'network', detail: err?.message || String(err) }] });
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleAddCustomProvider = () => {
    const newId = `custom_${Date.now()}`;
    const newProvider: ProviderConfig = {
      id: newId,
      name: 'Nuevo Proveedor API',
      baseUrl: 'https://api.ejemplo.com/v1',
      apiKey: '',
      isCustom: true,
      defaultModel: 'modelo-personalizado',
    };
    onUpdateProviders([...providers, newProvider]);
    setSelectedProviderId(newId);
    flashSaved();
  };

  const handleDeleteProvider = (id: string) => {
    if (providers.length <= 1) return;
    const remaining = providers.filter((p) => p.id !== id);
    onUpdateProviders(remaining);
    if (selectedProviderId === id) {
      setSelectedProviderId(remaining[0].id);
    }
  };

  const handleUseModel = (modelId: string) => {
    handleUpdateField('defaultModel', modelId);
    onSelectActiveProvider(currentProvider.id);
    onSelectActiveModel(modelId);
  };

  const filteredDiscoveredModels = (testResult.models || []).filter((m) =>
    m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
    (m.name && m.name.toLowerCase().includes(modelSearch.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        id="settings-modal"
        className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-[#1e1e1e] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Configuración de Proveedores & API
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Integra cualquier API OpenAI-compatible, personaliza Base URLs y explora modelos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - 2 Columns Layout */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Sidebar: Providers List */}
          <div className="md:col-span-4 p-4 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-[#191919]/30 flex flex-col gap-1 overflow-y-auto max-h-48 md:max-h-none">
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Proveedores
              </span>
              <button
                onClick={handleAddCustomProvider}
                title="Agregar nuevo proveedor personalizado"
                className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                <Plus className="w-3 h-3" />
                <span>Nuevo</span>
              </button>
            </div>

            <div className="space-y-1">
              {providers.map((p) => {
                const isSelected = p.id === currentProvider.id;
                const isActive = p.id === activeProviderId;
                const hasKey = Boolean(p.apiKey && p.apiKey.trim());

                return (
                  <div
                    key={p.id}
                    onClick={() => handleProviderChange(p.id)}
                    className={`w-full group px-3 py-2.5 rounded-xl cursor-pointer text-left text-xs sm:text-sm font-medium transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          hasKey || p.id === 'ollama' || p.id === 'lmstudio'
                            ? 'bg-emerald-500'
                            : 'bg-neutral-400'
                        }`}
                      />
                      <span className="truncate">{p.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isActive && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            isSelected
                              ? 'bg-neutral-700 text-white dark:bg-neutral-300 dark:text-neutral-900'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          Activo
                        </span>
                      )}
                      {p.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProvider(p.id);
                          }}
                          title="Eliminar proveedor"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500 hover:text-white transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Area: Provider Config Form & Discovered Models */}
          <div className="md:col-span-8 p-6 overflow-y-auto space-y-5">
            {/* Active Switcher & Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  {currentProvider.name}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Ajusta los parámetros de conexión y endpoints para este proveedor.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectActiveProvider(currentProvider.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  currentProvider.id === activeProviderId
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                    : 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90'
                }`}
              >
                {currentProvider.id === activeProviderId ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Proveedor Seleccionado</span>
                  </>
                ) : (
                  <span>Establecer como Activo</span>
                )}
              </button>
            </div>

            {/* Provider Name if custom */}
            {currentProvider.isCustom && (
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Nombre del Proveedor
                </label>
                <input
                  type="text"
                  value={currentProvider.name}
                  onChange={(e) => handleUpdateField('name', e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="Ej: Mi Servidor vLLM"
                />
              </div>
            )}

            {/* Base URL */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-neutral-400" />
                  Base URL (OpenAI Compatible)
                </label>
                {!currentProvider.isCustom && (
                  <button
                    type="button"
                    onClick={handleResetBaseUrl}
                    className="text-[11px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 underline"
                  >
                    Restablecer por defecto
                  </button>
                )}
              </div>
              <input
                type="text"
                value={currentProvider.baseUrl}
                onChange={(e) => handleUpdateField('baseUrl', e.target.value)}
                className="w-full px-3.5 py-2 font-mono text-xs sm:text-sm rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                La URL base para las llamadas a <code>/models</code> y <code>/chat/completions</code>.
              </p>
            </div>

            {/* API Key */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-neutral-400" />
                  Clave de API (API Key)
                </label>
                {currentProvider.id === 'openrouter' && (
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <span>Obtener key de OpenRouter</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {currentProvider.id === 'openai' && (
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <span>Obtener key de OpenAI</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {currentProvider.id === 'groq' && (
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <span>Obtener key de Groq</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {currentProvider.id === 'deepseek' && (
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <span>Obtener key de DeepSeek</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={currentProvider.apiKey}
                  onChange={(e) => handleUpdateField('apiKey', e.target.value)}
                  className="w-full px-3.5 py-2 pr-10 font-mono text-xs sm:text-sm rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder={
                    currentProvider.id === 'ollama' || currentProvider.id === 'lmstudio'
                      ? 'Opcional para servidores locales'
                      : 'sk-...'
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
                Tu clave se almacena de forma segura en tu navegador y no se envía a servidores de terceros salvo al proveedor configurado.
              </p>
            </div>

            {/* CORS Proxy Toggle */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Globe className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      Proxy CORS automático
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                      Si el proveedor bloquea las peticiones desde el navegador, se reintenta a través de un proxy público que añade los headers CORS necesarios. Recomendado para Google/Anthropic/X.AI.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateField('useProxy', currentProvider.useProxy === false ? true : false)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                    currentProvider.useProxy === false
                      ? 'bg-neutral-300 dark:bg-neutral-700'
                      : 'bg-emerald-500'
                  }`}
                  aria-pressed={currentProvider.useProxy !== false}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      currentProvider.useProxy === false ? 'left-0.5' : 'left-[22px]'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Test Connection & Discovered Models Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="w-full py-2.5 px-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 border border-neutral-200 dark:border-neutral-700"
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" />
                    <span>Conectando y obteniendo modelos...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Probar Conexión y Enlistar Modelos Disponibles</span>
                  </>
                )}
              </button>
            </div>

            {/* Diagnostic button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleDiagnose}
                disabled={isDiagnosing}
                className="w-full py-2 px-4 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 border border-amber-200 dark:border-amber-800"
              >
                {isDiagnosing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                    <span>Diagnosticando conexión directa y proxies...</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>Diagnóstico de conexión (si falla, usa esto para ver el motivo real)</span>
                  </>
                )}
              </button>
            </div>

            {/* Connection Test Result */}
            {testResult.status !== 'idle' && (
              <div
                className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                  testResult.status === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                }`}
              >
                {testResult.status === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{testResult.message}</p>
                </div>
              </div>
            )}

            {/* Diagnostics result */}
            {diagnostics && (
              <div className="p-3.5 rounded-xl border text-xs leading-relaxed bg-neutral-50 dark:bg-neutral-900/60 border-neutral-200 dark:border-neutral-800 space-y-2">
                <p className="font-semibold text-neutral-700 dark:text-neutral-200">Resultado del diagnóstico</p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 break-all">Objetivo: {diagnostics.target}</p>
                {diagnostics.attempts.map((a: DiagnosticAttempt, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${a.ok ? 'bg-emerald-500 text-white' : a.kind === 'cors' ? 'bg-red-500 text-white' : a.kind === 'timeout' ? 'bg-amber-500 text-white' : 'bg-orange-500 text-white'}`}>{a.ok ? '✓' : '×'}</span>
                    <div className="flex-1">
                      <p className={`font-medium ${a.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>{a.attempt}{a.status ? ` — HTTP ${a.status}` : ''}</p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 break-words">{a.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Discovered Models Explorer */}
            {testResult.models && testResult.models.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-neutral-400" />
                    Modelos Detectados ({testResult.models.length})
                  </h4>
                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder="Buscar modelo..."
                      className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {filteredDiscoveredModels.map((m) => {
                    const isCurrentDefault = currentProvider.defaultModel === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between gap-2 ${
                          isCurrentDefault
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700'
                            : 'bg-white dark:bg-[#181818] border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-mono font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {m.id}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                            {m.owned_by && <span>Propietario: {m.owned_by}</span>}
                            {m.context_length && (
                              <span>• Contexto: {m.context_length.toLocaleString()} tok</span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleUseModel(m.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                            isCurrentDefault
                              ? 'bg-emerald-600 text-white'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                          }`}
                        >
                          {isCurrentDefault ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Activo</span>
                            </>
                          ) : (
                            <span>Seleccionar</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50 flex items-center justify-between gap-2">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 font-medium transition-all ${
                showSavedIndicator
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'opacity-70'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {showSavedIndicator
                ? 'Proveedor guardado en el arness'
                : 'Los cambios se guardan automáticamente'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 transition-opacity"
          >
            Listo / Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

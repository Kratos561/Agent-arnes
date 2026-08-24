'use client';

import React from 'react';
import { X, Sliders, RotateCcw } from 'lucide-react';
import { ModelParameters, DEFAULT_PARAMETERS } from '@/lib/types';

interface ParametersModalProps {
  isOpen: boolean;
  onClose: () => void;
  parameters: ModelParameters;
  onChangeParameters: (params: ModelParameters) => void;
}

export const ParametersModal: React.FC<ParametersModalProps> = ({
  isOpen,
  onClose,
  parameters,
  onChangeParameters,
}) => {
  if (!isOpen) return null;

  const updateParam = (field: keyof ModelParameters, value: any) => {
    onChangeParameters({
      ...parameters,
      [field]: value,
    });
  };

  const handleReset = () => {
    onChangeParameters({ ...DEFAULT_PARAMETERS });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        id="parameters-modal"
        className="w-full max-w-lg bg-white dark:bg-[#1e1e1e] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Parámetros del Modelo
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Ajusta la creatividad, longitud y formato de las respuestas.
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

        {/* Sliders Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-neutral-800 dark:text-neutral-200">
                Temperature (Creatividad)
              </span>
              <span className="font-mono px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                {parameters.temperature}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={parameters.temperature}
              onChange={(e) => updateParam('temperature', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>0.0 (Preciso / Determinista)</span>
              <span>1.0 (Balanceado)</span>
              <span>2.0 (Creativo)</span>
            </div>
          </div>

          {/* Top_P */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-neutral-800 dark:text-neutral-200">
                Top P (Nucleus Sampling)
              </span>
              <span className="font-mono px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                {parameters.top_p}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={parameters.top_p}
              onChange={(e) => updateParam('top_p', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <p className="text-[11px] text-neutral-400">
              Alternativa a la temperatura. Considera solo los tokens que comprenden la masa de probabilidad top_p.
            </p>
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-neutral-800 dark:text-neutral-200">
                Tokens Máximos de Salida (Max Tokens)
              </span>
              <span className="font-mono px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                {parameters.max_tokens === 0
                  ? 'Auto (Máximo del modelo)'
                  : `${parameters.max_tokens.toLocaleString()} tokens`}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="65536"
              step="1024"
              value={parameters.max_tokens}
              onChange={(e) => updateParam('max_tokens', parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => updateParam('max_tokens', 0)}
                className={`px-2.5 py-1 text-[11px] rounded border transition-colors ${
                  parameters.max_tokens === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'bg-neutral-100 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                ⚡ Auto / Ilimitado
              </button>
              {[4096, 8192, 16384, 32768, 65536].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => updateParam('max_tokens', val)}
                  className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                    parameters.max_tokens === val
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : 'bg-neutral-100 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  }`}
                >
                  {val >= 1024 ? `${val / 1024}k` : val}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-400">
              💡 Usa <strong>⚡ Auto / Ilimitado</strong> para permitir que el modelo genere respuestas y código completos utilizando toda su ventana de contexto sin cortes artificiales.
            </p>
          </div>

          {/* Frequency Penalty */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-neutral-800 dark:text-neutral-200">
                Frequency Penalty (Penalización de repetición)
              </span>
              <span className="font-mono px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                {parameters.frequency_penalty}
              </span>
            </div>
            <input
              type="range"
              min="-2"
              max="2"
              step="0.1"
              value={parameters.frequency_penalty}
              onChange={(e) => updateParam('frequency_penalty', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
          </div>

          {/* Presence Penalty */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-neutral-800 dark:text-neutral-200">
                Presence Penalty (Introducir nuevos temas)
              </span>
              <span className="font-mono px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                {parameters.presence_penalty}
              </span>
            </div>
            <input
              type="range"
              min="-2"
              max="2"
              step="0.1"
              value={parameters.presence_penalty}
              onChange={(e) => updateParam('presence_penalty', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer valores</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 transition-opacity"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};

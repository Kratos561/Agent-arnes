'use client';

import React, { useState } from 'react';
import { X, Wand2, Terminal, BookOpen, PenTool, Globe, Briefcase, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

interface SystemPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: string;
  onSaveSystemPrompt: (prompt: string) => void;
}

export const SystemPromptModal: React.FC<SystemPromptModalProps> = ({
  isOpen,
  onClose,
  systemPrompt,
  onSaveSystemPrompt,
}) => {
  const [promptText, setPromptText] = useState(systemPrompt);
  const [showHarnessDetails, setShowHarnessDetails] = useState(false);

  if (!isOpen) return null;

  const presets = [
    {
      title: 'Programador Experto',
      icon: Terminal,
      prompt:
        'Eres un ingeniero de software senior y arquitecto de sistemas. Proporciona código limpio, tipado en TypeScript/Python según corresponda, eficiente y con comentarios explicativos. Si hay riesgos de seguridad o rendimiento, señálalos brevemente.',
    },
    {
      icon: BookOpen,
      title: 'Tutor Pedagógico',
      prompt:
        'Eres un profesor comprensivo y didáctico. Explica conceptos complejos paso a paso, utilizando analogías claras y ejemplos sencillos. Siempre haz preguntas al final para evaluar la comprensión del estudiante.',
    },
    {
      icon: PenTool,
      title: 'Redactor Creativo',
      prompt:
        'Eres un redactor y novelista profesional con dominio de la prosa persuasiva y la narrativa atractiva. Tu tono es sofisticado, evocador y libre de clichés o repeticiones innecesarias.',
    },
    {
      icon: Globe,
      title: 'Traductor Políglota',
      prompt:
        'Eres un traductor e intérprete experto. Traduce manteniendo el tono natural, modismos culturales y precisión gramatical. Explica cualquier matiz idiomático relevante si aporta claridad.',
    },
    {
      icon: Briefcase,
      title: 'Consultor de Negocios',
      prompt:
        'Eres un consultor estratégico de negocios y productos digitales. Analiza problemas con pensamiento de primeros principios, estructurando respuestas en puntos ejecutivos de alto impacto (resumen, análisis, plan de acción y métricas).',
    },
  ];

  const handleApplyPreset = (text: string) => {
    setPromptText(text);
  };

  const handleSave = () => {
    onSaveSystemPrompt(promptText.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        id="system-prompt-modal"
        className="w-full max-w-2xl bg-white dark:bg-[#1e1e1e] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center">
              <Wand2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Instrucciones del Sistema y Entorno (Harness)
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Define el comportamiento del modelo e inspecciona el contexto del harness inyectado.
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

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Harness Environment Banner */}
          <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/50 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span>Entorno y Harness Activo</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHarnessDetails(!showHarnessDetails)}
                className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium"
              >
                {showHarnessDetails ? 'Ocultar directivas' : 'Ver directivas inyectadas'}
                {showHarnessDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="mt-1 text-emerald-700/90 dark:text-emerald-400/80 text-[11.5px] leading-relaxed">
              Todos los modelos reciben automáticamente el contexto de ejecución: fecha/hora actual, visor de código interactivo, soporte LaTeX, panel de pensamiento (<code className="font-mono px-1 py-0.5 rounded bg-emerald-100/70 dark:bg-emerald-900/50">&lt;think&gt;</code>) y continuación fluida.
            </p>

            {showHarnessDetails && (
              <div className="mt-2.5 pt-2.5 border-t border-emerald-200/60 dark:border-emerald-800/40 text-[11px] text-neutral-700 dark:text-neutral-300 font-mono bg-white/70 dark:bg-neutral-900/70 p-2.5 rounded-lg whitespace-pre-wrap leading-relaxed">
                {`# DIRECTIVAS AUTOMÁTICAS DEL HARNESS:
- Identificador de modelo y proveedor activo.
- Fecha y hora exacta en tiempo real.
- Renderizado de código con bloques de lenguaje identificados.
- Notación matemática en LaTeX ($...$ y $$...$$).
- Captura de razonamiento / CoT en panel colapsable.
- Instrucciones de código completo sin marcadores incompletos.`}
              </div>
            )}
          </div>

          {/* Quick Presets */}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              Plantillas Rápidas
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {presets.map((p, idx) => {
                const Icon = p.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPreset(p.prompt)}
                    className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-emerald-500/50 bg-white dark:bg-[#181818] hover:bg-neutral-50 dark:hover:bg-[#252525] text-left transition-all flex items-center gap-2 text-xs"
                  >
                    <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span className="font-medium text-neutral-800 dark:text-neutral-200 truncate">
                      {p.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Textarea */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Instrucción Adicional Personalizada (Opcional)
            </label>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Ej: Eres un asistente conciso y amigable. Responde siempre en español y utiliza formato markdown para listas y código..."
              rows={5}
              className="w-full p-3 text-xs sm:text-sm rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed font-sans"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181818]/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPromptText('')}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline"
          >
            Limpiar prompt
          </button>
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
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 transition-opacity"
            >
              Guardar Instrucciones
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

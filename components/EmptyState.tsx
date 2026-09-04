'use client';

import React from 'react';
import { 
  Sparkles, 
  Code, 
  Lightbulb, 
  BookOpen, 
  HelpCircle, 
  ArrowRight,
  Server,
  Key
} from 'lucide-react';
import { ProviderConfig } from '@/lib/types';

interface EmptyStateProps {
  provider: ProviderConfig;
  activeModelId: string;
  hasApiKey: boolean;
  onSelectPrompt: (prompt: string) => void;
  onOpenSettings: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  provider,
  activeModelId,
  hasApiKey,
  onSelectPrompt,
  onOpenSettings,
}) => {
  const suggestions = [
    {
      icon: Code,
      title: 'Crear una API REST en Node.js',
      description: 'Genera un servidor Express con autenticación JWT y rutas CRUD.',
      prompt: 'Escribe un servidor en Node.js usando Express y TypeScript con autenticación JWT y un endpoint CRUD de usuarios con validaciones.',
    },
    {
      icon: Lightbulb,
      title: 'Explicar concepto técnico',
      description: 'Explica los modelos Transformer y el mecanismo de atención.',
      prompt: 'Explica de forma clara y con analogías intuitivas cómo funciona el mecanismo de autoatención (Self-Attention) en los modelos Transformer.',
    },
    {
      icon: BookOpen,
      title: 'Estrategia & Redacción',
      description: 'Estructura una propuesta de producto SaaS minimalista.',
      prompt: 'Crea una propuesta ejecutiva de 1 página para lanzar una herramienta SaaS de analítica web orientada a la privacidad, destacando propuesta de valor y modelo de monetización.',
    },
    {
      icon: HelpCircle,
      title: 'Depuración y optimización',
      description: 'Encuentra cuellos de botella en una función asíncrona.',
      prompt: 'Analiza cuáles son las mejores prácticas para optimizar peticiones asíncronas concurrentes en JavaScript y evitar memory leaks con AbortController.',
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-3xl mx-auto my-auto">
      {/* ChatGPT Brand Icon */}
      <div className="w-14 h-14 rounded-2xl bg-accent text-white flex items-center justify-center shadow-md mb-6 ring-4 ring-neutral-100 dark:ring-accent/20">
        <Sparkles className="w-7 h-7" />
      </div>

      {/* Main Title */}
      <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 tracking-tight">
        ¿En qué puedo ayudarte hoy?
      </h1>

      {/* Active Model / Provider Pill */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8 text-xs">
        <span className="px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-medium border border-neutral-200 dark:border-neutral-700 flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-emerald-500" />
          {provider.name}
        </span>
        <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-mono border border-emerald-200 dark:border-emerald-800/60">
          {activeModelId}
        </span>
      </div>

      {/* Warning banner if API key is missing and provider needs one */}
      {!hasApiKey && (
        <div className="w-full mb-8 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-left flex items-start gap-3">
          <Key className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              API Key no configurada para {provider.name}
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
              Para comenzar a chatear con este proveedor, configura tu clave API y Base URL en la ventana de ajustes. La clave se guarda sólo en el almacenamiento local de este navegador.
            </p>
            <button
              onClick={onOpenSettings}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors shadow-sm"
            >
              <Key className="w-3.5 h-3.5" />
              Configurar API Key y Base URL
            </button>
          </div>
        </div>
      )}

      {/* Prompt Suggestions Grid */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
        {suggestions.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectPrompt(item.prompt)}
              className="group p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white/80 dark:bg-[#232323]/80 hover:bg-neutral-50 dark:hover:bg-[#282829] transition-all text-left flex flex-col justify-between shadow-xs hover:shadow-sm"
            >
              <div className="flex items-start gap-3 mb-2">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 mt-2 self-end">
                <span>Usar plantilla</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

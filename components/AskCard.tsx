'use client';

import React, { useState } from 'react';
import { HelpCircle, Send, CheckSquare, Square } from 'lucide-react';
import { AskPayload } from '@/lib/types';

interface AskCardProps {
  ask: AskPayload;
  onAnswer: (ask: AskPayload, answer: string) => void;
  disabled?: boolean;
}

export const AskCard: React.FC<AskCardProps> = ({ ask, onAnswer, disabled = false }) => {
  const [selected, setSelected] = useState<string[]>(ask.multiple ? [] : []);
  const [freeText, setFreeText] = useState('');

  const isMultiple = Boolean(ask.multiple) && Array.isArray(ask.options) && ask.options.length > 0;
  const hasOptions = Array.isArray(ask.options) && ask.options.length > 0 && !ask.hideOptions;

  const toggleOption = (opt: string) => {
    if (isMultiple) {
      setSelected((prev) =>
        prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
      );
    } else {
      setSelected([opt]);
    }
  };

  const submit = () => {
    let answer = '';
    if (isMultiple) {
      answer = selected.join(', ');
    } else if (hasOptions) {
      answer = selected[0] || '';
    }
    if (!answer && freeText.trim()) {
      answer = freeText.trim();
    }
    if (answer) {
      onAnswer(ask, answer);
    }
  };

  const canSubmit =
    disabled ||
    (isMultiple ? selected.length > 0 : hasOptions ? selected.length > 0 : freeText.trim().length > 0);

  return (
    <div className="my-3 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent dark:from-accent/10 p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className="p-1.5 rounded-lg bg-accent/10 text-accent flex-shrink-0 mt-0.5">
          <HelpCircle className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              El modelo pregunta
            </span>
          </div>
          <p className="text-sm text-neutral-800 dark:text-neutral-200 font-medium leading-relaxed">
            {ask.question}
          </p>
        </div>
      </div>

      {hasOptions && (
        <div className="mt-3 grid gap-2">
          {ask.options!.map((opt) => {
            const isSel = selected.includes(opt);
            const Icon = isSel ? CheckSquare : Square;
            return (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                onClick={() => toggleOption(opt)}
                className={`w-full text-left flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
                  isSel
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-accent/40 hover:bg-accent/5'
                }`}
              >
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isSel ? 'text-accent' : 'text-neutral-400'}`} />
                <span className={isSel ? 'font-medium' : ''}>{opt}</span>
              </button>
            );
          })}
        </div>
      )}

      {!hasOptions && (
        <div className="mt-3">
          <input
            type="text"
            value={freeText}
            disabled={disabled}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={ask.placeholder || 'Escribe tu respuesta…'}
            className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#141414] text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        {isMultiple && (
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 mr-auto">
            {selected.length} seleccionada{selected.length === 1 ? '' : 's'}
          </span>
        )}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          <Send className="w-3.5 h-3.5" />
          Enviar respuesta
        </button>
      </div>
    </div>
  );
};

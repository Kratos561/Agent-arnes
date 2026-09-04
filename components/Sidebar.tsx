'use client';

import React, { useState } from 'react';
import { 
  Plus, 
  MessageSquare, 
  Search, 
  Trash2, 
  Edit2, 
  Pin, 
  PinOff, 
  Share2, 
  Moon, 
  Sun, 
  Sliders, 
  Settings, 
  ChevronLeft, 
  ChevronRight, 
  MoreHorizontal,
  Server,
  Sparkles,
  Check,
  X
} from 'lucide-react';
import { ChatSession, ProviderConfig } from '@/lib/types';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  activeProvider: ProviderConfig;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onPinSession: (id: string) => void;
  onExportSession: (session: ChatSession) => void;
  onClearAllSessions: () => void;
  onOpenSettings: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  sessions,
  activeSessionId,
  activeProvider,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  onPinSession,
  onExportSession,
  onClearAllSessions,
  onOpenSettings,
  isDarkMode,
  onToggleDarkMode,
}) => {
  const [search, setSearch] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  const pinnedSessions = filteredSessions.filter((s) => s.isPinned);
  const unpinnedSessions = filteredSessions.filter((s) => !s.isPinned);

  // Group unpinned sessions into Recent (first 10) and Previous
  const recentSessions = unpinnedSessions.slice(0, 10);
  const olderSessions = unpinnedSessions.slice(10);

  const startEditing = (s: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(s.id);
    setEditTitle(s.title);
  };

  const saveEditing = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editTitle.trim()) {
      onRenameSession(id, editTitle.trim());
    }
    setEditingSessionId(null);
  };

  const renderSessionItem = (s: ChatSession) => {
    const isActive = s.id === activeSessionId;
    const isEditing = s.id === editingSessionId;

    return (
      <div
        key={s.id}
        id={`session-item-${s.id}`}
        onClick={() => onSelectSession(s.id)}
        className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm font-medium cursor-pointer transition-all ${
          isActive
            ? 'bg-neutral-200/80 dark:bg-[#282828] text-neutral-900 dark:text-neutral-100 font-semibold'
            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#202020] hover:text-neutral-900 dark:hover:text-neutral-200'
        }`}
      >
        {/* Left icon & Title */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {s.isPinned ? (
            <Pin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          ) : (
            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
          )}

          {isEditing ? (
            <form
              onSubmit={(e) => saveEditing(s.id, e)}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 flex-1 min-w-0"
            >
              <input
                type="text"
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => saveEditing(s.id)}
                className="w-full px-1.5 py-0.5 text-xs rounded bg-white dark:bg-black text-neutral-900 dark:text-white border border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                className="p-1 text-emerald-600 hover:text-emerald-700"
              >
                <Check className="w-3 h-3" />
              </button>
            </form>
          ) : (
            <span className="truncate">{s.title || 'Chat sin título'}</span>
          )}
        </div>

        {/* Action icons on hover */}
        {!isEditing && (
          <div
            className={`items-center gap-1 ${
              isActive ? 'flex' : 'hidden sm:flex sm:group-hover:flex'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPinSession(s.id);
              }}
              title={s.isPinned ? 'Desanclar' : 'Anclar chat'}
              className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-300/60 dark:hover:bg-neutral-700"
            >
              {s.isPinned ? <PinOff className="w-3 h-3 text-amber-500" /> : <Pin className="w-3 h-3" />}
            </button>

            <button
              type="button"
              onClick={(e) => startEditing(s, e)}
              title="Renombrar"
              className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-300/60 dark:hover:bg-neutral-700"
            >
              <Edit2 className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(s.id);
              }}
              title="Eliminar chat"
              className="p-1 rounded text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-300/60 dark:hover:bg-neutral-700"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Overlay backdrop */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs md:hidden"
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-[#f9f9f9] dark:bg-[#1e1e1f] border-r border-neutral-200 dark:border-neutral-800 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:-translate-x-full md:w-0 md:border-r-0'
        }`}
      >
        {/* Top bar: Brand + New Chat */}
        <div className="p-3.5 flex flex-col gap-2.5 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-accent text-white flex items-center justify-center font-bold text-xs shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 tracking-tight">
                Universal AI Chat
              </span>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
              title="Ocultar barra lateral"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* New Chat Button */}
          <button
            type="button"
            id="new-chat-btn"
            onClick={onNewChat}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#232323] hover:bg-neutral-50 dark:hover:bg-[#282829] border border-neutral-200 dark:border-neutral-700/80 text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm font-semibold shadow-xs transition-all group"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>Nuevo chat</span>
            </div>
            <span className="text-[10px] text-neutral-400 border border-neutral-200 dark:border-neutral-700 rounded px-1 py-0.5 font-mono">
              Ctrl+N
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="px-3 pt-3 pb-1">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversaciones..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-[#282829] text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 border border-neutral-200 dark:border-neutral-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
          {pinnedSessions.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Anclados
              </div>
              {pinnedSessions.map(renderSessionItem)}
            </div>
          )}

          {recentSessions.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Conversaciones Recientes
              </div>
              {recentSessions.map(renderSessionItem)}
            </div>
          )}

          {olderSessions.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Anteriores
              </div>
              {olderSessions.map(renderSessionItem)}
            </div>
          )}

          {sessions.length === 0 && (
            <div className="py-12 px-4 text-center text-xs text-neutral-400">
              No tienes chats guardados. ¡Crea uno nuevo para empezar!
            </div>
          )}
        </div>

        {/* Bottom Panel: Provider Info + Settings + Dark Mode */}
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-[#f4f4f4] dark:bg-[#1a1a1b] space-y-1.5">
          {/* Active Provider Pill / Trigger */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#1f1f1f] hover:bg-neutral-100 dark:hover:bg-[#262626] border border-neutral-200 dark:border-neutral-800 text-left transition-colors flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse" />
              <div className="truncate font-medium text-neutral-800 dark:text-neutral-200">
                {activeProvider.name}
              </div>
            </div>
            <Settings className="w-3.5 h-3.5 text-neutral-400" />
          </button>

          {/* Controls Footer */}
          <div className="flex items-center justify-between px-1 pt-1">
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1.5 text-xs"
              title="Cambiar tema"
            >
              {isDarkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5" />
                  <span>Modo Claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Modo Oscuro</span>
                </>
              )}
            </button>

            {sessions.length > 0 && (
              <button
                type="button"
                onClick={onClearAllSessions}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-xs flex items-center gap-1"
                title="Borrar todos los chats"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

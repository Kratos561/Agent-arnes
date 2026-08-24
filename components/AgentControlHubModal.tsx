'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Key, 
  ShieldCheck, 
  Terminal, 
  History, 
  Archive, 
  Copy, 
  Check, 
  Plus, 
  RefreshCw, 
  Trash2, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ExternalLink,
  Code2,
  Database,
  Lock,
  Layers,
  Sparkles,
  ShieldAlert
} from 'lucide-react';

interface AgentControlHubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AgentControlHubModal: React.FC<AgentControlHubModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'agents' | 'mcp' | 'tools' | 'audit' | 'confirmations' | 'backups' | 'settings'>('agents');
  
  // Data state
  const [agents, setAgents] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<any>({});
  const [loading, setLoading] = useState(false);

  // New Agent Form
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRole, setNewAgentRole] = useState('SUPER_ADMIN_AGENT');
  const [newAgentConfirmation, setNewAgentConfirmation] = useState('AUTO_APPROVE');
  const [createdTokenAlert, setCreatedTokenAlert] = useState<{ name: string; token: string } | null>(null);

  // Tool Tester Form
  const [selectedTool, setSelectedTool] = useState('platform_read');
  const [toolParamsJson, setToolParamsJson] = useState('{\n  "include_env": false,\n  "include_db_summary": true\n}');
  const [isDryRun, setIsDryRun] = useState(false);
  const [toolExecutionResult, setToolExecutionResult] = useState<any>(null);
  const [isExecutingTool, setIsExecutingTool] = useState(false);

  // Copy feedback state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const masterToken = 'ag_super_master_live_key_999';

  // Load data
  const fetchData = React.useCallback(async () => {
    try {
      // Fetch Agents
      const agentsRes = await fetch('/api/v1/agents', {
        headers: { Authorization: `Bearer ${masterToken}` },
      });
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || []);
      }

      // Fetch Tools
      const toolsRes = await fetch('/api/v1/tools', {
        headers: { Authorization: `Bearer ${masterToken}` },
      });
      if (toolsRes.ok) {
        const data = await toolsRes.json();
        setTools(data.tools || []);
      }

      // Fetch Audit Logs
      const auditRes = await fetch('/api/v1/audit?limit=30', {
        headers: { Authorization: `Bearer ${masterToken}` },
      });
      if (auditRes.ok) {
        const data = await auditRes.json();
        setAuditLogs(data.logs || []);
      }

      // Fetch Backups
      const backupsRes = await fetch('/api/v1/backups', {
        headers: { Authorization: `Bearer ${masterToken}` },
      });
      if (backupsRes.ok) {
        const data = await backupsRes.json();
        setBackups(data.backups || []);
      }

      // Fetch Confirmations
      const confRes = await fetch('/api/v1/confirmations', {
        headers: { Authorization: `Bearer ${masterToken}` },
      });
      if (confRes.ok) {
        const data = await confRes.json();
        setPendingConfirmations(data.pending || []);
      }

      // Fetch Settings
      const setRes = await fetch('/api/v1/settings', {
        headers: { Authorization: `Bearer ${masterToken}` },
      });
      if (setRes.ok) {
        const data = await setRes.json();
        setSystemSettings(data.settings || {});
      }
    } catch (e) {
      console.error('Error loading agent hub data:', e);
    } finally {
      setLoading(false);
    }
  }, [masterToken]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, fetchData]);

  // Create Agent
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;

    try {
      const res = await fetch('/api/v1/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({
          name: newAgentName.trim(),
          role: newAgentRole,
          confirmation_mode: newAgentConfirmation,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCreatedTokenAlert({
          name: data.agent.name,
          token: data.token,
        });
        setNewAgentName('');
        fetchData();
      }
    } catch (err) {
      console.error('Failed to create agent', err);
    }
  };

  // Revoke Agent
  const handleRevokeAgent = async (agentId: string) => {
    if (!confirm('¿Estás seguro de revocar este agente?')) return;
    try {
      await fetch(`/api/v1/agents/${agentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${masterToken}` },
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Execute Tool Test
  const handleExecuteTool = async () => {
    setIsExecutingTool(true);
    setToolExecutionResult(null);
    try {
      let parsedParams = {};
      try {
        parsedParams = JSON.parse(toolParamsJson);
      } catch {
        alert('El JSON de parámetros no es válido.');
        setIsExecutingTool(false);
        return;
      }

      const res = await fetch('/api/v1/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({
          tool: selectedTool,
          parameters: parsedParams,
          dry_run: isDryRun,
        }),
      });

      const data = await res.json();
      setToolExecutionResult(data);
      fetchData();
    } catch (err: any) {
      setToolExecutionResult({ error: err.message });
    } finally {
      setIsExecutingTool(false);
    }
  };

  // Handle Confirmation
  const handleResolveConfirmation = async (confirmationId: string, action: 'approve' | 'reject') => {
    try {
      await fetch('/api/v1/confirmations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ confirmation_id: confirmationId, action }),
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Rollback
  const handleRestoreBackup = async (backupId: string) => {
    if (!confirm(`¿Restaurar el estado del recurso desde el snapshot ${backupId}?`)) return;
    try {
      const res = await fetch('/api/v1/backups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ backup_id: backupId }),
      });
      const data = await res.json();
      alert(data.message || 'Restauración completada');
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Global Confirmation
  const handleToggleGlobalConfirmation = async () => {
    const nextMode = systemSettings.global_confirmation_mode === 'REQUIRE_CONFIRMATION' ? 'AUTO_APPROVE' : 'REQUIRE_CONFIRMATION';
    try {
      await fetch('/api/v1/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({
          settings: { global_confirmation_mode: nextMode },
        }),
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        id="agent-control-hub-modal"
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden text-neutral-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-white">AI-Agent Control Hub & Servidor MCP</h2>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  SUPER_ADMIN_READY
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Interfaz Universal para Agentes Autónomos con Acceso Completo (API REST v1 + MCP)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
              title="Refrescar estado"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors text-sm font-medium"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/40 px-6 gap-2 overflow-x-auto">
          {[
            { id: 'agents', label: 'Tokens & Agentes', icon: Key },
            { id: 'mcp', label: 'Servidor MCP & Guía', icon: Layers },
            { id: 'tools', label: 'Consola de Herramientas', icon: Terminal },
            { id: 'audit', label: 'Auditoría en Vivo', icon: History },
            { id: 'confirmations', label: `Aprobaciones (${pendingConfirmations.length})`, icon: ShieldCheck },
            { id: 'backups', label: 'Backups & Snapshots', icon: Archive },
            { id: 'settings', label: 'Políticas & Seguridad', icon: Lock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: AGENTS & TOKENS */}
          {activeTab === 'agents' && (
            <div className="space-y-6">
              {/* Alert for newly generated token */}
              {createdTokenAlert && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> Token emitido para &quot;{createdTokenAlert.name}&quot;
                    </span>
                    <button
                      onClick={() => setCreatedTokenAlert(null)}
                      className="text-xs text-emerald-400/80 hover:text-emerald-300"
                    >
                      Cerrar
                    </button>
                  </div>
                  <p className="text-xs text-neutral-300">
                    Copia este token ahora. Por seguridad, los tokens completos no se vuelven a mostrar.
                  </p>
                  <div className="flex items-center gap-2 bg-black/60 p-2.5 rounded-lg border border-emerald-500/20">
                    <code className="font-mono text-xs text-emerald-300 flex-1 break-all">
                      {createdTokenAlert.token}
                    </code>
                    <button
                      onClick={() => handleCopy(createdTokenAlert.token, 'new_token')}
                      className="p-1.5 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white"
                    >
                      {copiedKey === 'new_token' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Master Super Admin Quick Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                    <div>
                      <h4 className="text-sm font-semibold text-white">Master Super Admin Key (Acceso Total)</h4>
                      <p className="text-xs text-neutral-400">Credencial root con alcances globales y permisos de modificación ilimitados.</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    SUPER_ADMIN_AGENT
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-neutral-950 p-2.5 rounded-lg border border-neutral-800">
                  <code className="font-mono text-xs text-blue-300 flex-1">
                    {masterToken}
                  </code>
                  <button
                    onClick={() => handleCopy(masterToken, 'master_token')}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
                  >
                    {copiedKey === 'master_token' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copiar Key</span>
                  </button>
                </div>
              </div>

              {/* Create New Agent Form */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-4">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-400" /> Registrar Nuevo Agente de IA
                </h4>
                <form onSubmit={handleCreateAgent} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-neutral-400 block mb-1">Nombre del Agente</label>
                    <input
                      type="text"
                      placeholder="Ej. Claude-Code-Assistant"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">Rol / Permisos</label>
                    <select
                      value={newAgentRole}
                      onChange={(e) => setNewAgentRole(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="SUPER_ADMIN_AGENT">SUPER_ADMIN_AGENT (Acceso Total)</option>
                      <option value="DEVELOPER_AGENT">DEVELOPER_AGENT (Código & Tests)</option>
                      <option value="OPERATOR_AGENT">OPERATOR_AGENT (Base de Datos & Ops)</option>
                      <option value="READONLY_AGENT">READONLY_AGENT (Solo Lectura)</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={!newAgentName.trim()}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 h-[34px]"
                    >
                      <Key className="w-3.5 h-3.5" /> Generar Credencial
                    </button>
                  </div>
                </form>
              </div>

              {/* Registered Agents Table */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white">Agentes Registrados ({agents.length})</h4>
                <div className="border border-neutral-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                      <tr>
                        <th className="p-3">Agente</th>
                        <th className="p-3">Rol</th>
                        <th className="p-3">Alcances (Scopes)</th>
                        <th className="p-3">Modo</th>
                        <th className="p-3">Estado</th>
                        <th className="p-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {agents.map((agent) => (
                        <tr key={agent.agent_id} className="hover:bg-neutral-800/30">
                          <td className="p-3">
                            <div className="font-medium text-white">{agent.name}</div>
                            <div className="text-[11px] font-mono text-neutral-400">{agent.agent_id}</div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono text-[11px]">
                              {agent.role}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {agent.scopes?.slice(0, 3).map((s: string) => (
                                <span key={s} className="px-1.5 py-0.5 bg-neutral-800 rounded text-[10px] text-neutral-300">
                                  {s}
                                </span>
                              ))}
                              {(agent.scopes?.length || 0) > 3 && (
                                <span className="text-[10px] text-neutral-500">+{agent.scopes.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-neutral-300 font-mono text-[11px]">
                            {agent.confirmation_mode}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              agent.status === 'active' 
                                ? 'bg-emerald-500/10 text-emerald-400' 
                                : 'bg-rose-500/10 text-rose-400'
                            }`}>
                              {agent.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {agent.status === 'active' && agent.agent_id !== 'agent_super_admin_master' && (
                              <button
                                onClick={() => handleRevokeAgent(agent.agent_id)}
                                className="p-1 text-neutral-400 hover:text-rose-400 transition-colors"
                                title="Revocar Agente"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MCP SERVER & INTEGRATION GUIDE */}
          {activeTab === 'mcp' && (
            <div className="space-y-6">
              {/* PRIMARY METHOD: MCP STDIO BRIDGE */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/60 to-purple-950/40 border border-blue-500/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-300 font-semibold text-sm">
                    <Terminal className="w-5 h-5 text-blue-400" />
                    <span>Método Recomendado: Bridge Local MCP Stdio (Inmune a Bloqueos de Proxy)</span>
                  </div>
                  <span className="px-2.5 py-0.5 text-[11px] rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                    100% Sin Bloqueo de Cookies
                  </span>
                </div>
                <p className="text-xs text-neutral-200 leading-relaxed">
                  Los clientes MCP (Claude Desktop, Cursor, Continue, Windsurf) se comunican directamente a través de entrada/salida estándar (<code className="text-blue-300 font-mono">stdio</code>) ejecutando el script puente <code className="text-emerald-300 font-mono">scripts/mcp-agent-bridge.js</code>. Este puente transmite comandos autorizados aplicando de forma estricta los <strong>permisos y alcances (scopes)</strong> concedidos a la API Key.
                </p>

                {/* Claude Desktop Config Snippet (Stdio) */}
                <div className="p-3.5 rounded-lg bg-black/60 border border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <span>Configuración para Claude Desktop</span>
                      <code className="text-[11px] text-neutral-400 font-mono font-normal">(claude_desktop_config.json)</code>
                    </span>
                    <button
                      onClick={() => handleCopy(JSON.stringify({
                        mcpServers: {
                          "app-platform": {
                            command: "node",
                            args: ["/ruta/absoluta/a/tu/proyecto/scripts/mcp-agent-bridge.js"],
                            env: {
                              AGENT_API_KEY: masterToken,
                              PLATFORM_BASE_URL: typeof window !== 'undefined' ? window.location.origin : "http://localhost:3000"
                            }
                          }
                        }
                      }, null, 2), 'mcp_stdio_claude')}
                      className="text-xs px-2.5 py-1 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 text-blue-200 rounded flex items-center gap-1.5 transition-colors"
                    >
                      {copiedKey === 'mcp_stdio_claude' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copiar Configuración Stdio</span>
                    </button>
                  </div>
                  <pre className="p-2.5 bg-neutral-950 rounded text-xs font-mono text-neutral-300 overflow-x-auto">
{`{
  "mcpServers": {
    "app-platform": {
      "command": "node",
      "args": ["scripts/mcp-agent-bridge.js"],
      "env": {
        "AGENT_API_KEY": "${masterToken}",
        "PLATFORM_BASE_URL": "${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}"
      }
    }
  }
}`}
                  </pre>
                </div>

                {/* Cursor & Windsurf Config Snippet */}
                <div className="p-3.5 rounded-lg bg-black/60 border border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <span>Configuración para Cursor IDE</span>
                      <code className="text-[11px] text-neutral-400 font-mono font-normal">(.cursor/mcp.json)</code>
                    </span>
                    <button
                      onClick={() => handleCopy(JSON.stringify({
                        mcpServers: {
                          "app-platform": {
                            command: "node",
                            args: ["scripts/mcp-agent-bridge.js"],
                            env: {
                              AGENT_API_KEY: masterToken
                            }
                          }
                        }
                      }, null, 2), 'mcp_stdio_cursor')}
                      className="text-xs px-2.5 py-1 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 rounded flex items-center gap-1.5 transition-colors"
                    >
                      {copiedKey === 'mcp_stdio_cursor' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copiar Cursor JSON</span>
                    </button>
                  </div>
                  <pre className="p-2.5 bg-neutral-950 rounded text-xs font-mono text-neutral-300 overflow-x-auto">
{`{
  "mcpServers": {
    "app-platform": {
      "command": "node",
      "args": ["scripts/mcp-agent-bridge.js"],
      "env": {
        "AGENT_API_KEY": "${masterToken}"
      }
    }
  }
}`}
                  </pre>
                </div>

                {/* CLI Quick Test */}
                <div className="p-3 rounded-lg bg-black/40 border border-blue-500/20 text-xs text-neutral-300 space-y-1.5">
                  <div className="font-semibold text-blue-300 flex items-center justify-between">
                    <span>Prueba rápida del Bridge en Terminal:</span>
                    <button
                      onClick={() => handleCopy(`npx tsx scripts/test-mcp-bridge.ts`, 'test_bridge_cmd')}
                      className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                    >
                      {copiedKey === 'test_bridge_cmd' ? 'Copiado!' : 'Copiar comando de test'}
                    </button>
                  </div>
                  <code className="block p-2 bg-neutral-950 rounded font-mono text-emerald-400 text-[11px]">
                    npx tsx scripts/test-mcp-bridge.ts
                  </code>
                </div>
              </div>

              {/* HTTP / SSE Direct Endpoint Details */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-400" /> Endpoint HTTP / SSE (Para conexiones directas y túneles)
                  </h4>
                  <span className="px-2 py-0.5 text-xs rounded bg-blue-500/10 text-blue-300 font-mono">
                    Protocol 2024-11-05 (JSON-RPC 2.0)
                  </span>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Endpoint directo para servidores HTTP remotos o túneles Cloudflare / Ngrok sin proxy intermediario.
                </p>

                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold text-neutral-300">Endpoint HTTP / JSON-RPC / SSE:</div>
                  <div className="flex items-center gap-2 bg-neutral-900 p-2.5 rounded-lg border border-neutral-800">
                    <code className="font-mono text-xs text-emerald-400 flex-1">
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/v1/mcp` : '/api/v1/mcp'}
                    </code>
                    <button
                      onClick={() => handleCopy(typeof window !== 'undefined' ? `${window.location.origin}/api/v1/mcp` : '/api/v1/mcp', 'mcp_endpoint')}
                      className="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded"
                    >
                      {copiedKey === 'mcp_endpoint' ? 'Copiado!' : 'Copiar URL'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Curl & REST Quickstart */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-200">Invocación Directa Universal REST (curl)</span>
                  <a
                    href="/api/v1/docs"
                    target="_blank"
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <span>Abrir Explorador OpenAPI</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <pre className="p-3 bg-neutral-900 rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto">
{`# 1. Listar Herramientas autorizadas para este token
curl -X GET ${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/tools \\
  -H "Authorization: Bearer ${masterToken}"

# 2. Ejecutar Herramienta (Ej. Leer Archivo de Código)
curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/tools/execute \\
  -H "Authorization: Bearer ${masterToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"tool": "file_read", "parameters": {"path": "package.json"}}'`}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE TOOL TESTER */}
          {activeTab === 'tools' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Tool Configuration */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-neutral-300 block mb-1">
                      Seleccionar Herramienta ({tools.length} disponibles)
                    </label>
                    <select
                      value={selectedTool}
                      onChange={(e) => {
                        setSelectedTool(e.target.value);
                        // Provide sensible defaults
                        if (e.target.value === 'file_read') {
                          setToolParamsJson('{\n  "path": "package.json",\n  "offset": 1,\n  "limit": 50\n}');
                        } else if (e.target.value === 'database_query') {
                          setToolParamsJson('{\n  "table": "app_entities",\n  "limit": 10\n}');
                        } else if (e.target.value === 'tests_run') {
                          setToolParamsJson('{\n  "type": "lint"\n}');
                        } else if (e.target.value === 'platform_read') {
                          setToolParamsJson('{\n  "include_env": false,\n  "include_db_summary": true\n}');
                        }
                      }}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      {tools.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name} [{t.category}] {t.dangerous ? '⚠️' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-neutral-300">Parámetros (JSON)</label>
                      <label className="flex items-center gap-1.5 text-xs text-amber-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isDryRun}
                          onChange={(e) => setIsDryRun(e.target.checked)}
                          className="rounded bg-neutral-900 border-neutral-700 text-amber-500 focus:ring-0"
                        />
                        <span>Modo Dry-Run (Simulación)</span>
                      </label>
                    </div>
                    <textarea
                      rows={8}
                      value={toolParamsJson}
                      onChange={(e) => setToolParamsJson(e.target.value)}
                      className="w-full font-mono text-xs bg-neutral-950 border border-neutral-700 rounded-lg p-3 text-neutral-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    onClick={handleExecuteTool}
                    disabled={isExecutingTool}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    <span>{isExecutingTool ? 'Ejecutando...' : 'Ejecutar Herramienta'}</span>
                  </button>
                </div>

                {/* Right Column: Execution Output */}
                <div className="space-y-2 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-300">Resultado de Ejecución</span>
                    {toolExecutionResult && (
                      <span className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                        toolExecutionResult.status === 'success' || toolExecutionResult.success
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {toolExecutionResult.status || (toolExecutionResult.success ? 'SUCCESS' : 'ERROR')}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg p-4 font-mono text-xs overflow-auto max-h-[360px]">
                    {toolExecutionResult ? (
                      <pre className="text-neutral-300">
                        {JSON.stringify(toolExecutionResult, null, 2)}
                      </pre>
                    ) : (
                      <div className="text-neutral-500 italic flex items-center justify-center h-full">
                        Presiona &quot;Ejecutar Herramienta&quot; para probar la invocación.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Registro de Auditoría Integral ({auditLogs.length})</h4>
                <button
                  onClick={fetchData}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refrescar
                </button>
              </div>

              <div className="border border-neutral-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th className="p-3">Fecha/Hora</th>
                      <th className="p-3">Agente</th>
                      <th className="p-3">Herramienta</th>
                      <th className="p-3">Acción</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Duración</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-neutral-500">
                          Aún no se registran actividades de agentes.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-neutral-800/30">
                          <td className="p-3 text-neutral-400 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="p-3 text-white font-medium">
                            {log.agent_name || log.agent_id}
                          </td>
                          <td className="p-3 font-mono text-blue-300">
                            {log.tool}
                          </td>
                          <td className="p-3 text-neutral-300">
                            {log.action}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              log.status === 'success'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : log.status === 'pending_approval'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}>
                              {log.dry_run ? '[DRY-RUN] ' : ''}{log.status}
                            </span>
                          </td>
                          <td className="p-3 text-neutral-400 font-mono">
                            {log.duration_ms}ms
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: PENDING CONFIRMATIONS */}
          {activeTab === 'confirmations' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white">
                Acciones Sensibles en Espera de Aprobación Humana ({pendingConfirmations.length})
              </h4>
              
              {pendingConfirmations.length === 0 ? (
                <div className="p-8 text-center border border-neutral-800 rounded-xl bg-neutral-950/40 text-neutral-400 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-sm font-medium text-white">Bandeja de Aprobaciones Limpia</p>
                  <p className="text-xs text-neutral-500">
                    No hay solicitudes pendientes que requieran intervención humana en este momento.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingConfirmations.map((conf) => (
                    <div key={conf.id} className="p-4 rounded-xl bg-neutral-950 border border-amber-500/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-amber-400" />
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {conf.tool} solicitada por {conf.agent_name}
                            </div>
                            <div className="text-xs text-neutral-400">ID: {conf.id} | {new Date(conf.created_at).toLocaleString()}</div>
                          </div>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold">
                          PENDING_APPROVAL
                        </span>
                      </div>

                      <div className="bg-neutral-900 p-3 rounded-lg font-mono text-xs text-neutral-300 overflow-x-auto">
                        <pre>{JSON.stringify(conf.parameters, null, 2)}</pre>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => handleResolveConfirmation(conf.id, 'reject')}
                          className="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-rose-300 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <XCircle className="w-4 h-4" /> Rechazar
                        </button>
                        <button
                          onClick={() => handleResolveConfirmation(conf.id, 'approve')}
                          className="px-4 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Aprobar y Ejecutar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: BACKUPS & SNAPSHOTS */}
          {activeTab === 'backups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white">Puntos de Restauración Automáticos ({backups.length})</h4>
                  <p className="text-xs text-neutral-400">Snapshots creados automáticamente antes de modificaciones o eliminaciones de archivos y tablas.</p>
                </div>
                <button
                  onClick={fetchData}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refrescar
                </button>
              </div>

              <div className="border border-neutral-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th className="p-3">ID Backup</th>
                      <th className="p-3">Recurso</th>
                      <th className="p-3">Acción Previa</th>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3 text-right">Restaurar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {backups.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-neutral-500">
                          No hay backups guardados aún.
                        </td>
                      </tr>
                    ) : (
                      backups.map((b) => (
                        <tr key={b.id} className="hover:bg-neutral-800/30">
                          <td className="p-3 font-mono text-blue-300">{b.id}</td>
                          <td className="p-3 text-white font-medium">{b.resource_path}</td>
                          <td className="p-3 text-neutral-400">{b.action}</td>
                          <td className="p-3 text-neutral-400">{new Date(b.created_at).toLocaleString()}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              b.is_restored ? 'bg-blue-500/10 text-blue-400' : 'bg-neutral-800 text-neutral-300'
                            }`}>
                              {b.is_restored ? 'Restaurado' : 'Disponible'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleRestoreBackup(b.id)}
                              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-blue-300 rounded text-xs transition-colors"
                            >
                              Rollback
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: SETTINGS & POLICIES */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-4">
                <h4 className="text-sm font-semibold text-white">Política de Ejecución y Aprobación</h4>
                <div className="flex items-center justify-between p-3 bg-neutral-900 rounded-lg border border-neutral-800">
                  <div>
                    <div className="text-xs font-semibold text-white">Modo de Confirmación Global</div>
                    <div className="text-xs text-neutral-400">
                      {systemSettings.global_confirmation_mode === 'REQUIRE_CONFIRMATION'
                        ? 'Las herramientas potencialmente peligrosas (file_write, file_edit, exec, database_delete) requieren aprobación humana.'
                        : 'Los agentes con permisos SUPER_ADMIN_AGENT ejecutan cambios de manera autónoma e instantánea (AUTO_APPROVE).'}
                    </div>
                  </div>
                  <button
                    onClick={handleToggleGlobalConfirmation}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      systemSettings.global_confirmation_mode === 'REQUIRE_CONFIRMATION'
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {systemSettings.global_confirmation_mode || 'AUTO_APPROVE'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-neutral-800 bg-neutral-950/80 text-xs text-neutral-400">
          <div>
            <span>Universal AI Platform: </span>
            <span className="font-mono text-emerald-400">READY (v1.0.0)</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

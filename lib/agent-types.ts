/**
 * Model Context Protocol (MCP) & Universal AI Agent Types and Interfaces
 */

export type AgentRole = 
  | 'SUPER_ADMIN_AGENT'
  | 'DEVELOPER_AGENT'
  | 'OPERATOR_AGENT'
  | 'READONLY_AGENT'
  | 'CUSTOM';

export type ConfirmationMode = 'AUTO_APPROVE' | 'REQUIRE_CONFIRMATION';

export type AgentStatus = 'active' | 'suspended' | 'revoked';

export interface AgentRecord {
  agent_id: string;
  client_id: string;
  name: string;
  description?: string;
  role: AgentRole;
  scopes: string[]; // e.g. ['*'], ['FULL_PLATFORM_ACCESS'], ['code:*'], ['database:*'], etc.
  status: AgentStatus;
  token_hash: string;
  token_preview: string; // e.g. "ag_live_...9f2a"
  created_at: number;
  last_used_at?: number;
  expires_at?: number; // timestamp or undefined for perpetual
  confirmation_mode: ConfirmationMode;
  metadata?: Record<string, any>;
}

export interface AuditLogEntry {
  id: string;
  agent_id: string;
  agent_name?: string;
  agent_role?: AgentRole;
  user_id?: string;
  request_id: string;
  tool: string;
  action: string;
  resource: string;
  parameters?: Record<string, any>;
  result?: any;
  error?: string;
  status: 'success' | 'error' | 'pending_approval' | 'rejected';
  dry_run?: boolean;
  duration_ms: number;
  ip?: string;
  timestamp: number;
}

export interface BackupRecord {
  id: string;
  resource_type: 'file' | 'database_table' | 'setting' | 'batch';
  resource_path: string;
  created_at: number;
  agent_id: string;
  action: string;
  description: string;
  snapshot_data: string; // JSON or raw content
  is_restored?: boolean;
}

export interface PendingConfirmation {
  id: string;
  request_id: string;
  agent_id: string;
  agent_name: string;
  tool: string;
  action: string;
  parameters: Record<string, any>;
  preview_diff?: string;
  created_at: number;
  status: 'pending' | 'approved' | 'rejected';
  resolved_at?: number;
  resolved_by?: string;
}

export interface ToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: any;
  properties?: Record<string, any>;
  required?: string[];
  default?: any;
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: 'platform' | 'code' | 'database' | 'files' | 'settings' | 'users' | 'tests' | 'mcp' | 'backup';
  required_scope: string;
  dangerous?: boolean;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
}

export interface ToolExecutionContext {
  agent: AgentRecord;
  request_id: string;
  dry_run?: boolean;
  ip?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  dry_run?: boolean;
  backup_id?: string;
  diff?: string;
  pending_confirmation_id?: string;
  metadata?: Record<string, any>;
}

// MCP (Model Context Protocol) JSON-RPC 2.0 Standard Interfaces
export interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPToolItem {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPResourceItem {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPromptItem {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

import crypto from 'crypto';
import { AuditLogEntry, ToolExecutionContext } from './agent-types';
import { insertAuditLog } from './agent-db';
import { sanitizeSecrets } from './agent-auth';

export function recordAudit(params: {
  context: ToolExecutionContext;
  tool: string;
  action: string;
  resource: string;
  parameters?: Record<string, any>;
  result?: any;
  error?: string;
  status: 'success' | 'error' | 'pending_approval' | 'rejected';
  dry_run?: boolean;
  duration_ms: number;
}): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: `audit_${crypto.randomBytes(8).toString('hex')}`,
    agent_id: params.context.agent.agent_id,
    agent_name: params.context.agent.name,
    agent_role: params.context.agent.role,
    request_id: params.context.request_id,
    tool: params.tool,
    action: params.action,
    resource: params.resource,
    parameters: sanitizeSecrets(params.parameters),
    result: sanitizeSecrets(params.result),
    error: params.error,
    status: params.status,
    dry_run: params.dry_run || params.context.dry_run || false,
    duration_ms: params.duration_ms,
    ip: params.context.ip,
    timestamp: Date.now(),
  };

  insertAuditLog(entry);
  return entry;
}

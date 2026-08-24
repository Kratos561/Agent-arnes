import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AgentRecord, AuditLogEntry, BackupRecord, PendingConfirmation } from './agent-types';

const DATA_DIR = path.join(process.cwd(), '.agent_data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface DynamicDatabaseTable {
  id: string;
  name: string;
  description: string;
  columns: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'json' | 'date';
    required?: boolean;
    unique?: boolean;
    default?: any;
  }>;
  indexes?: string[];
  created_at: number;
  updated_at: number;
  records: Array<Record<string, any>>;
}

export interface PlatformDatabaseSchema {
  version: number;
  system_settings: Record<string, any>;
  agents: AgentRecord[];
  audit_logs: AuditLogEntry[];
  backups: BackupRecord[];
  pending_confirmations: PendingConfirmation[];
  tables: Record<string, DynamicDatabaseTable>;
}

// In-memory cache for fast reads
let memoryCache: PlatformDatabaseSchema | null = null;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

function ensureDataDirectory(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getDefaultDatabase(): PlatformDatabaseSchema {
  // Generate a default master super admin key on first initialization
  const defaultAdminKey = 'ag_super_master_live_key_999';
  const defaultDevKey = 'ag_dev_full_access_key_123';

  const defaultAdminAgent: AgentRecord = {
    agent_id: 'agent_super_admin_master',
    client_id: 'super-admin-cli',
    name: 'Master Super Admin Agent',
    description: 'Autonomous Master Agent with Full Platform Access and Root Permissions',
    role: 'SUPER_ADMIN_AGENT',
    scopes: ['*', 'FULL_PLATFORM_ACCESS', 'platform:*', 'code:*', 'database:*', 'files:*', 'settings:*', 'users:*', 'tests:*', 'deployment:*'],
    status: 'active',
    token_hash: hashToken(defaultAdminKey),
    token_preview: 'ag_super_..._999',
    created_at: Date.now(),
    confirmation_mode: 'AUTO_APPROVE',
    metadata: {
      is_system_master: true,
    },
  };

  const defaultDevAgent: AgentRecord = {
    agent_id: 'agent_developer_default',
    client_id: 'dev-assistant-mcp',
    name: 'Developer Assistant Agent',
    description: 'Developer Agent capable of reading code, writing files, and running test diagnostics',
    role: 'DEVELOPER_AGENT',
    scopes: ['code:*', 'files:*', 'tests:*', 'platform:read', 'database:read'],
    status: 'active',
    token_hash: hashToken(defaultDevKey),
    token_preview: 'ag_dev_..._123',
    created_at: Date.now(),
    confirmation_mode: 'AUTO_APPROVE',
    metadata: {
      is_default_dev: true,
    },
  };

  // Default dynamic table for demo entities
  const initialEntitiesTable: DynamicDatabaseTable = {
    id: 'table_app_entities',
    name: 'app_entities',
    description: 'Dynamic platform entities created and managed by agents',
    columns: [
      { name: 'id', type: 'string', required: true, unique: true },
      { name: 'title', type: 'string', required: true },
      { name: 'status', type: 'string', required: true, default: 'active' },
      { name: 'metadata', type: 'json' },
      { name: 'created_at', type: 'number', required: true },
      { name: 'updated_at', type: 'number', required: true },
    ],
    indexes: ['id', 'status'],
    created_at: Date.now(),
    updated_at: Date.now(),
    records: [
      {
        id: 'ent_001',
        title: 'Platform Initial Health Baseline',
        status: 'verified',
        metadata: { version: '1.0.0', agent_ready: true },
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ],
  };

  return {
    version: 1,
    system_settings: {
      platform_name: 'Universal AI Agent Hub',
      global_confirmation_mode: 'AUTO_APPROVE',
      max_audit_logs: 5000,
      auto_backup_enabled: true,
      mcp_server_enabled: true,
      api_v1_enabled: true,
      safe_mode_restrictions: false,
    },
    agents: [defaultAdminAgent, defaultDevAgent],
    audit_logs: [],
    backups: [],
    pending_confirmations: [],
    tables: {
      app_entities: initialEntitiesTable,
    },
  };
}

export function getDatabase(): PlatformDatabaseSchema {
  if (memoryCache) {
    return memoryCache;
  }

  ensureDataDirectory();

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      memoryCache = {
        ...getDefaultDatabase(),
        ...parsed,
        system_settings: {
          ...getDefaultDatabase().system_settings,
          ...(parsed.system_settings || {}),
        },
        tables: {
          ...getDefaultDatabase().tables,
          ...(parsed.tables || {}),
        },
      };
      return memoryCache!;
    } catch (e) {
      console.error('Failed to parse agent DB file, reinitializing with default database', e);
    }
  }

  const initial = getDefaultDatabase();
  saveDatabase(initial);
  memoryCache = initial;
  return initial;
}

export function saveDatabase(db: PlatformDatabaseSchema): void {
  ensureDataDirectory();
  memoryCache = db;
  try {
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Error persisting agent DB to disk', err);
  }
}

// Helper query methods
export function findAgentByToken(token: string): AgentRecord | null {
  if (!token) return null;
  const hash = hashToken(token);
  const db = getDatabase();
  return db.agents.find((a) => a.token_hash === hash && a.status === 'active') || null;
}

export function findAgentById(agentId: string): AgentRecord | null {
  const db = getDatabase();
  return db.agents.find((a) => a.agent_id === agentId) || null;
}

export function insertAuditLog(entry: AuditLogEntry): void {
  const db = getDatabase();
  db.audit_logs.unshift(entry);
  
  // Cap audit log size
  const maxLogs = db.system_settings?.max_audit_logs || 5000;
  if (db.audit_logs.length > maxLogs) {
    db.audit_logs = db.audit_logs.slice(0, maxLogs);
  }
  
  saveDatabase(db);
}

export function updateAgentLastUsed(agentId: string): void {
  const db = getDatabase();
  const agent = db.agents.find((a) => a.agent_id === agentId);
  if (agent) {
    agent.last_used_at = Date.now();
    saveDatabase(db);
  }
}

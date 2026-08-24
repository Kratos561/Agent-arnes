import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BackupRecord } from './agent-types';
import { getDatabase, saveDatabase } from './agent-db';

const BACKUPS_DIR = path.join(process.cwd(), '.agent_backups');

function ensureBackupsDir(): void {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

export function createFileBackup(filePath: string, agentId: string, action: string): string | null {
  try {
    ensureBackupsDir();
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(absolutePath)) {
      return null;
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const backupId = `bk_file_${crypto.randomBytes(8).toString('hex')}`;
    const relativePath = path.relative(process.cwd(), absolutePath);

    // Save snapshot to backup dir
    const backupFilePath = path.join(BACKUPS_DIR, `${backupId}.snapshot`);
    fs.writeFileSync(backupFilePath, content, 'utf-8');

    const backupRecord: BackupRecord = {
      id: backupId,
      resource_type: 'file',
      resource_path: relativePath,
      created_at: Date.now(),
      agent_id: agentId,
      action,
      description: `Automated backup before ${action} on ${relativePath}`,
      snapshot_data: content,
      is_restored: false,
    };

    const db = getDatabase();
    db.backups.unshift(backupRecord);

    // Cap backup records
    if (db.backups.length > 500) {
      db.backups = db.backups.slice(0, 500);
    }

    saveDatabase(db);
    return backupId;
  } catch (err) {
    console.error('Error creating file backup:', err);
    return null;
  }
}

export function createDatabaseTableBackup(tableName: string, agentId: string, action: string): string | null {
  try {
    const db = getDatabase();
    const table = db.tables[tableName];
    if (!table) return null;

    const backupId = `bk_db_${crypto.randomBytes(8).toString('hex')}`;
    const snapshotJson = JSON.stringify(table);

    const backupRecord: BackupRecord = {
      id: backupId,
      resource_type: 'database_table',
      resource_path: tableName,
      created_at: Date.now(),
      agent_id: agentId,
      action,
      description: `Automated database table snapshot before ${action} on '${tableName}'`,
      snapshot_data: snapshotJson,
      is_restored: false,
    };

    db.backups.unshift(backupRecord);
    saveDatabase(db);
    return backupId;
  } catch (err) {
    console.error('Error creating table backup:', err);
    return null;
  }
}

export function restoreBackup(backupId: string): { success: boolean; message: string } {
  try {
    const db = getDatabase();
    const backup = db.backups.find((b) => b.id === backupId);
    if (!backup) {
      return { success: false, message: `Backup con ID ${backupId} no encontrado.` };
    }

    if (backup.resource_type === 'file') {
      const absolutePath = path.join(process.cwd(), backup.resource_path);
      const parentDir = path.dirname(absolutePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(absolutePath, backup.snapshot_data, 'utf-8');
      backup.is_restored = true;
      saveDatabase(db);
      return { success: true, message: `Archivo '${backup.resource_path}' restaurado con éxito desde el backup ${backupId}.` };
    }

    if (backup.resource_type === 'database_table') {
      const restoredTable = JSON.parse(backup.snapshot_data);
      db.tables[backup.resource_path] = restoredTable;
      backup.is_restored = true;
      saveDatabase(db);
      return { success: true, message: `Tabla '${backup.resource_path}' restaurada con éxito desde el backup ${backupId}.` };
    }

    return { success: false, message: `Tipo de recurso no soportado para restauración: ${backup.resource_type}` };
  } catch (err: any) {
    return { success: false, message: `Error al restaurar backup: ${err.message}` };
  }
}

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  PendingSubmission,
  PendingSubmissionV2,
  SaveEnvelope,
  SaveEnvelopeV3,
  SubmissionReceipt,
} from '../types/game';

export const CELL_DATABASE_NAME = 'build-a-living-cell';
export const CELL_DATABASE_VERSION = 2;

export interface AttemptRecordV1 {
  recordVersion: 1;
  attemptId: string;
  storageRevision: number;
  resumeVisible: boolean;
  save: SaveEnvelopeV3;
}

export interface ActiveAttemptMetaV1 {
  kind: 'active-attempt';
  recordVersion: 1;
  attemptId: string | null;
  generation: number;
  updatedAt: number;
}

export interface HealthProbeMetaV1 {
  kind: 'health-probe';
  recordVersion: 1;
  nonce: string;
  createdAt: number;
}

export type CellMetaRecordV1 = ActiveAttemptMetaV1 | HealthProbeMetaV1;
export type SubmissionQueueRecord = PendingSubmission | PendingSubmissionV2;

export interface CellGameDbV2 extends DBSchema {
  saves: {
    key: string;
    value: SaveEnvelope;
  };
  attempts: {
    key: string;
    value: AttemptRecordV1;
  };
  meta: {
    key: string;
    value: CellMetaRecordV1;
  };
  submissionQueue: {
    key: string;
    value: SubmissionQueueRecord;
  };
  receipts: {
    key: string;
    value: SubmissionReceipt;
  };
}

let databasePromise: Promise<IDBPDatabase<CellGameDbV2>> | null = null;
let activeConnection: IDBPDatabase<CellGameDbV2> | null = null;
let blockedOpen = false;
let connectionGeneration = 0;

export function wasCellDatabaseOpenBlocked(): boolean {
  return blockedOpen;
}

export function openCellGameDatabase(): Promise<IDBPDatabase<CellGameDbV2>> {
  if (!databasePromise) {
    blockedOpen = false;
    const requestedGeneration = connectionGeneration;
    const opening = openDB<CellGameDbV2>(CELL_DATABASE_NAME, CELL_DATABASE_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
        if (!db.objectStoreNames.contains('attempts')) db.createObjectStore('attempts');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('submissionQueue')) {
          db.createObjectStore('submissionQueue');
        }
        if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts');
      },
      blocked() {
        blockedOpen = true;
      },
      blocking() {
        activeConnection?.close();
        activeConnection = null;
        databasePromise = null;
        connectionGeneration += 1;
      },
      terminated() {
        activeConnection = null;
        databasePromise = null;
        connectionGeneration += 1;
      },
    })
      .then((db) => {
        if (requestedGeneration !== connectionGeneration) {
          db.close();
          throw new Error('INDEXED_DB_OPEN_SUPERSEDED');
        }
        activeConnection = db;
        return db;
      })
      .catch((error) => {
        if (databasePromise === opening) {
          databasePromise = null;
          activeConnection = null;
        }
        throw error;
      });
    databasePromise = opening;
  }
  return databasePromise;
}

export function closeCellGameDatabase(): void {
  connectionGeneration += 1;
  activeConnection?.close();
  activeConnection = null;
  databasePromise = null;
  blockedOpen = false;
}

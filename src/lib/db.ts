import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface QueueDbItem {
  id: string;
  fileBlob: Blob;
  fileName: string;
  sku?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultBlob?: Blob;
  color: 'white' | 'charcoal';
  hideDoubleDoor?: boolean;
  error?: string;
  colorUnified?: boolean;
  skipColorCheck?: boolean;
  highContrastMode?: boolean;
  isRepaint?: boolean;
  isPolish?: boolean;
  isGlassTune?: boolean;
  isStructuralFix?: boolean;
  isReshape?: boolean;
  structuralFixBlob?: Blob;
}

export interface SpreadDbItem {
  id: string;
  targetSku: string;
  imageUrl: string;
}

interface DoorDB extends DBSchema {
  queue: {
    key: string;
    value: QueueDbItem;
  };
  spreads: {
    key: string;
    value: SpreadDbItem;
  };
}

let dbPromise: Promise<IDBPDatabase<DoorDB>>;

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<DoorDB>('door-catalog-db', 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('spreads')) {
          db.createObjectStore('spreads', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

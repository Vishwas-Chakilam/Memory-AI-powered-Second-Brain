import { MemoryItem, Collection } from '../types';

const DB_NAME = 'SecondBrainDB';
const STORE_NAME = 'memories';
const COLLECTIONS_STORE = 'collections';
const DB_VERSION = 2;

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject('Error opening database');

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Upgrade existing store or create new one
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      } else {
        // If store exists, check if we need to add the collection index
        // Note: IndexedDB doesn't support nested property indexing, so we'll filter in memory
        const store = (event.target as IDBOpenDBRequest).transaction!.objectStore(STORE_NAME);
        if (!store.indexNames.contains('createdAt')) {
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      }
      
      if (!db.objectStoreNames.contains(COLLECTIONS_STORE)) {
        const collectionsStore = db.createObjectStore(COLLECTIONS_STORE, { keyPath: 'id' });
        collectionsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
};

export const saveMemory = async (memory: MemoryItem): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(memory);

    request.onsuccess = () => resolve();
    request.onerror = () => reject('Error saving memory');
  });
};

export const getAllMemories = async (): Promise<MemoryItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('createdAt');
    // Get all, sorted by date (newest first via manual sort usually, but index helps)
    const request = index.getAll();

    request.onsuccess = () => {
      // Sort newest first
      const results = request.result as MemoryItem[];
      resolve(results.sort((a, b) => b.createdAt - a.createdAt));
    };
    request.onerror = () => reject('Error fetching memories');
  });
};

export const deleteMemory = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject('Error deleting memory');
  });
};

// Collections
export const saveCollection = async (collection: Collection): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([COLLECTIONS_STORE], 'readwrite');
    const store = transaction.objectStore(COLLECTIONS_STORE);
    const request = store.put(collection);

    request.onsuccess = () => resolve();
    request.onerror = () => reject('Error saving collection');
  });
};

export const getAllCollections = async (): Promise<Collection[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([COLLECTIONS_STORE], 'readonly');
    const store = transaction.objectStore(COLLECTIONS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result as Collection[];
      resolve(results.sort((a, b) => b.createdAt - a.createdAt));
    };
    request.onerror = () => reject('Error fetching collections');
  });
};

export const getMemoriesByCollection = async (collectionName: string): Promise<MemoryItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Filter in memory since IndexedDB doesn't support nested property indexing
      const results = (request.result as MemoryItem[])
        .filter(m => (m.aiMetadata.collection || 'General') === collectionName)
        .sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };
    request.onerror = () => reject('Error fetching memories by collection');
  });
};

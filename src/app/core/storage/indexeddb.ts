import { QrProject } from '../models/project.model';

const DB_NAME = 'qr_studio_db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

export class IndexedDbStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window;
  }

  private getDb(): Promise<IDBDatabase> {
    if (!this.isBrowser()) {
      return Promise.reject(new Error('IndexedDB is not available outside browser'));
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  async getAll(): Promise<QrProject[]> {
    if (!this.isBrowser()) return [];
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const projects = (req.result as QrProject[]) || [];
        projects.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(projects);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getById(id: string): Promise<QrProject | null> {
    if (!this.isBrowser()) return null;
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(project: QrProject): Promise<void> {
    if (!this.isBrowser()) return;
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(project);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async delete(id: string): Promise<void> {
    if (!this.isBrowser()) return;
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

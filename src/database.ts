import type { IdeaProject, IdeasRepository } from './models';

const DATABASE_NAME = 'ideas-board-local';
const DATABASE_VERSION = 1;
const PROJECT_STORE = 'projects';

export class IndexedDbIdeasRepository implements IdeasRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  async listProjects(): Promise<IdeaProject[]> {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(PROJECT_STORE, 'readonly')
        .objectStore(PROJECT_STORE)
        .getAll();
      request.onsuccess = () => resolve((request.result as IdeaProject[])
        .sort((first, second) => second.updatedAt - first.updatedAt));
      request.onerror = () => reject(request.error);
    });
  }

  async saveProject(project: IdeaProject): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PROJECT_STORE, 'readwrite');
      transaction.objectStore(PROJECT_STORE).put(project);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async deleteProject(id: string): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PROJECT_STORE, 'readwrite');
      transaction.objectStore(PROJECT_STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(PROJECT_STORE)) {
            request.result.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.databasePromise;
  }
}
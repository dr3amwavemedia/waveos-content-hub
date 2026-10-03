import type { SupportedStorage } from "@supabase/supabase-js";

const DATABASE_NAME = "waveos-auth";
const DATABASE_VERSION = 1;
const STORE_NAME = "sessions";

function openAuthDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Private browsing modes and restricted webviews can deny IndexedDB.
    // localStorage remains the compatible fallback in those environments.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function readBackup(key: string): Promise<string | null> {
  return openAuthDatabase().then(
    (database) =>
      new Promise((resolve) => {
        if (!database) return resolve(null);
        const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
        request.onerror = () => resolve(null);
      }),
  );
}

function writeBackup(key: string, value: string): Promise<void> {
  return openAuthDatabase().then(
    (database) =>
      new Promise((resolve) => {
        if (!database) return resolve();
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      }),
  );
}

function removeBackup(key: string): Promise<void> {
  return openAuthDatabase().then(
    (database) =>
      new Promise((resolve) => {
        if (!database) return resolve();
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      }),
  );
}

/**
 * Keeps Supabase's existing localStorage session format while maintaining an
 * IndexedDB recovery copy. Existing users are migrated on their next session
 * read, and sign-out clears both copies.
 */
export function durableBrowserAuthStorage(
  baseStorage: SupportedStorage | undefined,
): SupportedStorage | undefined {
  if (typeof window === "undefined" || !baseStorage) return baseStorage;

  return {
    getItem: async (key) => {
      const existing = await baseStorage.getItem(key);
      if (existing) {
        void writeBackup(key, existing);
        return existing;
      }

      const recovered = await readBackup(key);
      if (recovered) await baseStorage.setItem(key, recovered);
      return recovered;
    },
    setItem: async (key, value) => {
      await baseStorage.setItem(key, value);
      await writeBackup(key, value);
    },
    removeItem: async (key) => {
      await baseStorage.removeItem(key);
      await removeBackup(key);
    },
  };
}

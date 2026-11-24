// IndexedDB storage. Everything stays in this browser; Backup/Restore moves it.
import { DEFAULT_SETTINGS } from './model.js';

const STORES = ['catalogue', 'services', 'tiers', 'quotes'];
let dbp;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('quotemaker', 1);
    req.onupgradeneeded = () => {
      STORES.forEach(s => req.result.createObjectStore(s, { keyPath: 'id' }));
      req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run(stores, mode, fn) {
  const tx = (await db()).transaction(stores, mode);
  let result;
  try { result = fn(tx); } catch (e) { tx.abort(); throw e; } // a sync throw would otherwise commit a half-done write
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error); });
  return result?.result ?? result;
}

export const all = store => run(store, 'readonly', tx => tx.objectStore(store).getAll());
export const get = (store, id) => run(store, 'readonly', tx => tx.objectStore(store).get(id));
export const put = (store, obj) => run(store, 'readwrite', tx => { tx.objectStore(store).put(obj); });
export const del = (store, id) => run(store, 'readwrite', tx => { tx.objectStore(store).delete(id); });

export async function getSettings() {
  const s = await run('kv', 'readonly', tx => tx.objectStore('kv').get('settings'));
  return { ...structuredClone(DEFAULT_SETTINGS), ...s };
}
export const putSettings = s => run('kv', 'readwrite', tx => { tx.objectStore('kv').put(s, 'settings'); });

export async function loadAll() {
  const [catalogue, services, tiers, quotes, settings] = await Promise.all([...STORES.map(all), getSettings()]);
  return { catalogue, services, tiers, quotes, settings };
}

export function replaceAll(data) {
  return run([...STORES, 'kv'], 'readwrite', tx => {
    for (const s of STORES) {
      const os = tx.objectStore(s);
      os.clear();
      (data[s] || []).forEach(o => os.put(o));
    }
    tx.objectStore('kv').put(data.settings, 'settings');
  });
}

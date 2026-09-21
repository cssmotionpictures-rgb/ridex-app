// =============================================================================
// MASTER VAULT — on-device safety net for finished masters
// =============================================================================
// When the platform-side save path is unavailable (integration credit freeze,
// Drive outage, network), the finished master WAV is parked in this IndexedDB
// vault instead of being lost. A background flusher re-uploads and re-syncs
// every parked master to Google Drive on the next app load (and on manual
// retry) — keeping the file safe costs zero platform credits.
// =============================================================================

import { uploadFileWithProgress } from "@/lib/uploadWithProgress";

const DB_NAME = "ridex_master_vault";
const STORE = "masters";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("vault unavailable"));
  });
}

function withStore(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => { db.close(); resolve(req.result); };
        t.onerror = () => { db.close(); reject(req.error); };
      })
  );
}

export async function vaultPut({ id, file_name, project_title, blob }) {
  return withStore("readwrite", (s) =>
    s.put({ id, file_name, project_title, blob, created_at: new Date().toISOString() })
  );
}

export async function vaultList() {
  try { return await withStore("readonly", (s) => s.getAll()); } catch { return []; }
}

export async function vaultDelete(id) {
  try { return await withStore("readwrite", (s) => s.delete(id)); } catch {}
}

// Retry every parked master: credit-proof upload (platform storage first,
// in-browser CORS host second) then the normal Drive save. Items that still
// fail simply stay parked for the next attempt — nothing is ever dropped.
export async function flushVault(base44) {
  const items = await vaultList();
  const results = [];
  for (const item of items) {
    let ok = false;
    try {
      const file = new File([item.blob], item.file_name, { type: "audio/wav" });
      const { file_url } = await uploadFileWithProgress(file);
      if (!file_url) throw new Error("no url");
      await base44.functions.invoke("drive-save-master", {
        file_url,
        file_name: item.file_name,
        project_title: item.project_title,
      });
      ok = true;
      await vaultDelete(item.id);
    } catch {}
    results.push({ id: item.id, file_name: item.file_name, ok });
  }
  return { attempted: items.length, results };
}
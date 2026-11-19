// Document files, kept in this browser's IndexedDB (they are too big for localStorage).
// Nothing here is sent anywhere. Files never leave the device unless the user downloads or shares them.
(function (root) {
  'use strict';
  const DB = 'rentuk-files', STORE = 'files';
  let opening = null;

  function db() {
    if (!root.indexedDB) return Promise.reject(new Error('This browser cannot store files.'));
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const req = root.indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { opening = null; reject(req.error || new Error('Could not open file storage.')); };
      });
    }
    return opening;
  }
  function run(mode, fn) {
    return db().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      tx.onerror = () => reject(tx.error || new Error('File storage failed.'));
      tx.onabort = () => reject(tx.error || new Error('File storage is full or blocked.'));
    }));
  }

  root.RentUKFiles = {
    put: (id, blob) => run('readwrite', s => s.put(blob, id)),
    get: id => run('readonly', s => s.get(id)),
    remove: id => run('readwrite', s => s.delete(id)),
    clear: () => run('readwrite', s => s.clear())
  };
})(window);

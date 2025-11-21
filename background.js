const STORAGE_KEY = 'savedItems';

const storageGet = (keys) =>
  new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result);
    });
  });

const storageSet = (obj) =>
  new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });

const MAX_ITEMS = 300;

const ensureStorageArray = async () => {
  const existing = await storageGet({ [STORAGE_KEY]: [] });
  if (!Array.isArray(existing[STORAGE_KEY])) {
    await storageSet({ [STORAGE_KEY]: [] });
  }
};

const readItems = async () => {
  const result = await storageGet({ [STORAGE_KEY]: [] });
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
};

const writeItems = (items) => storageSet({ [STORAGE_KEY]: items });

const handlers = {
  async SAVE_AD_ITEM({ item }) {
    if (!item) throw new Error('Missing item payload');
    const items = await readItems();
    const withoutDuplicate = items.filter((entry) => entry.id !== item.id);
    withoutDuplicate.unshift(item);
    const trimmed = withoutDuplicate.slice(0, MAX_ITEMS);
    try {
      await writeItems(trimmed);
    } catch (error) {
      const message = error?.message || String(error);
      if (/QUOTA_BYTES/i.test(message)) {
        throw new Error('Storage is full. Remove some saved ads and try again.');
      }
      throw error;
    }
    return item;
  },
  async GET_AD_ITEMS() {
    return readItems();
  },
  async DELETE_AD_ITEM({ id }) {
    if (!id) throw new Error('Missing id');
    const items = await readItems();
    const filtered = items.filter((entry) => entry.id !== id);
    await writeItems(filtered);
    return filtered;
  },
  async CLEAR_ALL_ITEMS() {
    await writeItems([]);
    return [];
  }
};

chrome.runtime.onInstalled.addListener(() => {
  ensureStorageArray().catch((error) => console.error('Swipekit Lite init error', error));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = message && handlers[message.type];
  if (!handler) return undefined;
  handler(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unknown error' }));
  return true;
});

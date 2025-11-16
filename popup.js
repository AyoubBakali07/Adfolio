const sendMessage = (type, payload = {}) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || 'Unknown error'));
        return;
      }
      resolve(response.data);
    });
  });

const updateCount = async () => {
  const countEl = document.getElementById('savedCount');
  try {
    const items = await sendMessage('GET_AD_ITEMS');
    countEl.textContent = items.length;
  } catch (error) {
    console.warn('Failed to fetch saved items', error);
    countEl.textContent = '–';
  }
};

const openDashboard = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('openDashboard').addEventListener('click', openDashboard);
  updateCount();
});

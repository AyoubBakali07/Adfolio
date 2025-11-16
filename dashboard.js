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

let items = [];
let searchQuery = '';

const formatDate = (iso) => {
  if (!iso) return 'Unknown date';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const truncate = (text, limit = 240) => {
  if (!text) return '[No text captured]';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

const applyFilters = () => {
  if (!searchQuery) return [...items];
  const normalized = searchQuery.toLowerCase();
  return items.filter((item) => {
    const haystack = [item.text, item.platform, item.pageUrl].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(normalized);
  });
};

const renderItems = () => {
  const container = document.getElementById('cardGrid');
  container.innerHTML = '';
  const filtered = applyFilters();

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = items.length
      ? 'No items match your search.'
      : 'No creatives saved yet. Capture some using the extension.';
    container.appendChild(empty);
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'ad-card';

    const header = document.createElement('div');
    header.className = 'card-header';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = item.platform;

    const date = document.createElement('span');
    date.className = 'timestamp';
    date.textContent = formatDate(item.capturedAt);

    header.appendChild(badge);
    header.appendChild(date);

    const text = document.createElement('p');
    text.className = 'card-text';
    text.textContent = truncate(item.text);

    const images = item.imageUrls || [];
    const videos = item.videoUrls || [];
    const hasMedia = images.length || videos.length;
    let thumbs;
    if (hasMedia) {
      thumbs = document.createElement('div');
      thumbs.className = 'thumbs';
      images.forEach((url) => {
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Ad creative';
        img.loading = 'lazy';
        thumbs.appendChild(img);
      });
      videos.forEach((url) => {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.setAttribute('title', 'Ad creative video');
        thumbs.appendChild(video);
      });
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const link = document.createElement('a');
    link.className = 'btn btn-ghost';
    link.textContent = 'View source';
    if (item.pageUrl) {
      link.href = item.pageUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      link.href = '#';
      link.classList.add('is-disabled');
      link.setAttribute('aria-disabled', 'true');
      link.addEventListener('click', (event) => event.preventDefault());
    }

    const del = document.createElement('button');
    del.className = 'btn btn-danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteItem(item.id));

    actions.appendChild(link);
    actions.appendChild(del);

    card.appendChild(header);
    card.appendChild(text);
    if (thumbs) {
      card.appendChild(thumbs);
    }
    card.appendChild(actions);
    container.appendChild(card);
  });
};

const fetchItems = async () => {
  try {
    items = await sendMessage('GET_AD_ITEMS');
    renderItems();
  } catch (error) {
    console.error('Failed to load items', error);
  }
};

const deleteItem = async (id) => {
  try {
    const updated = await sendMessage('DELETE_AD_ITEM', { id });
    items = updated;
    renderItems();
  } catch (error) {
    console.error('Failed to delete item', error);
  }
};

const clearAll = async () => {
  if (!items.length) return;
  if (!confirm('Clear all saved items?')) return;
  try {
    await sendMessage('CLEAR_ALL_ITEMS');
    items = [];
    renderItems();
  } catch (error) {
    console.error('Failed to clear items', error);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchInput').addEventListener('input', (event) => {
    searchQuery = event.target.value.trim();
    renderItems();
  });
  document.getElementById('clearAll').addEventListener('click', clearAll);
  fetchItems();
});

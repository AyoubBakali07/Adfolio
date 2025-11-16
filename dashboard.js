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

const formatRelativeTime = (dateString) => {
  if (!dateString) return 'moments ago';
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return 'moments ago';
  const seconds = Math.floor((Date.now() - value.getTime()) / 1000);
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ];
  for (const [unit, secondsInUnit] of units) {
    const amount = Math.floor(seconds / secondsInUnit);
    if (amount >= 1) return `${amount} ${unit}${amount > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
};

const formatFullDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const truncate = (text, limit = 140) => {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

const getBrandName = (item) => (item.brandName && item.brandName.trim()) || 'Unknown brand';

const getHostname = (url) => {
  if (!url) return 'Unknown source';
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return 'Unknown source';
  }
};

const applyFilters = () => {
  if (!searchQuery) return [...items];
  const term = searchQuery.toLowerCase();
  return items.filter((item) => {
    const haystack = [item.text, item.platform, item.pageUrl]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
};

const bindEvent = (selector, eventName, handler, { silent = false } = {}) => {
  const element = document.querySelector(selector);
  if (!element) {
    if (!silent) console.warn(`Swipekit dashboard: missing element ${selector}`);
    return null;
  }
  element.addEventListener(eventName, handler);
  return element;
};

const createMediaElement = (item) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'ad-card-media';
  const videoUrl = Array.isArray(item.videoUrls) ? item.videoUrls.find(Boolean) : null;
  const imageUrl = Array.isArray(item.imageUrls) ? item.imageUrls.find(Boolean) : null;

  if (videoUrl) {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.controls = true;
    video.muted = true;
    video.playsInline = true;
    wrapper.appendChild(video);
    return wrapper;
  }

  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = 'Ad creative';
    wrapper.appendChild(image);
    return wrapper;
  }

  const placeholder = document.createElement('div');
  placeholder.className = 'ad-card-placeholder';
  placeholder.textContent = 'No media yet';
  wrapper.appendChild(placeholder);
  return wrapper;
};

const extractTitle = (text) => {
  if (!text) return 'Untitled ad';
  const segments = text
    .split(/\n+/)
    .flatMap((segment) => segment.split(/(?<=[.!?])\s+/))
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) return 'Untitled ad';
  return truncate(segments[0], 90);
};

const extractDescription = (text) => {
  if (!text) return 'No caption captured for this ad yet.';
  const segments = text.split(/\n+/).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length <= 1) return text.trim();
  return segments.slice(1).join(' ');
};

const createDescriptionBlock = (text) => {
  const description = text || 'No caption captured for this ad yet.';
  const limit = 220;
  const container = document.createElement('div');
  container.className = 'ad-card-description';

  const paragraph = document.createElement('p');
  const applyState = (expanded) => {
    paragraph.textContent = expanded ? description : truncate(description, limit);
  };

  applyState(false);
  container.appendChild(paragraph);

  if (description.length > limit) {
    let expanded = false;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ad-card-toggle';
    toggle.textContent = 'Show more';
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      applyState(expanded);
      toggle.textContent = expanded ? 'Show less' : 'Show more';
    });
    container.appendChild(toggle);
  }

  return container;
};

const createTagChip = (label) => {
  const chip = document.createElement('span');
  chip.className = 'tag-chip';
  chip.textContent = label;
  return chip;
};

const createBrandHeader = (item) => {
  const container = document.createElement('div');
  container.className = 'ad-card-brand';

  const avatar = document.createElement('div');
  avatar.className = 'ad-card-brand-avatar';
  if (item.brandLogo) {
    const img = document.createElement('img');
    img.src = item.brandLogo;
    img.alt = `${getBrandName(item)} logo`;
    avatar.appendChild(img);
  } else {
    avatar.textContent = getBrandName(item).charAt(0).toUpperCase();
  }

  const text = document.createElement('div');
  text.className = 'ad-card-brand-text';
  const title = document.createElement('p');
  title.className = 'ad-card-brand-name';
  title.textContent = getBrandName(item);
  const subtitle = document.createElement('p');
  subtitle.className = 'ad-card-brand-time';
  const relative = formatRelativeTime(item.capturedAt);
  const platform = (item.platform || 'Ad Library').replace(/-/g, ' ');
  subtitle.textContent = `Saved ${relative} · ${platform}`;
  text.appendChild(title);
  text.appendChild(subtitle);

  container.appendChild(avatar);
  container.appendChild(text);
  return container;
};

const handleCardSave = (item) => {
  const mediaUrl = (item.imageUrls && item.imageUrls.find(Boolean)) || (item.videoUrls && item.videoUrls.find(Boolean));
  const target = mediaUrl || item.pageUrl;
  if (target) {
    window.open(target, '_blank', 'noopener');
  } else {
    alert('No media or link available to open for this ad yet.');
  }
};

const deleteItem = async (id) => {
  if (!id || !confirm('Delete this saved ad?')) return;
  try {
    await sendMessage('DELETE_AD_ITEM', { id });
    items = items.filter((entry) => entry.id !== id);
    renderItems();
  } catch (error) {
    console.error('Failed to delete item:', error);
    alert('Could not delete this ad. Please try again.');
  }
};

const createAdCard = (item) => {
  const card = document.createElement('article');
  card.className = 'ad-card';

  card.appendChild(createMediaElement(item));

  const body = document.createElement('div');
  body.className = 'ad-card-body';

  const brandHeader = createBrandHeader(item);

  const meta = document.createElement('div');
  meta.className = 'ad-card-meta';

  const metaText = document.createElement('div');
  const label = document.createElement('p');
  label.className = 'ad-card-label';
  label.textContent = (item.platform || 'Ad Library').replace(/-/g, ' ').toUpperCase();
  const time = document.createElement('p');
  time.className = 'ad-card-time';
  const absolute = formatFullDate(item.capturedAt);
  time.textContent = absolute || '';
  metaText.appendChild(label);
  metaText.appendChild(time);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'ad-card-delete';
  deleteBtn.type = 'button';
  deleteBtn.innerHTML = '&times;';
  deleteBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    deleteItem(item.id);
  });

  meta.appendChild(metaText);
  meta.appendChild(deleteBtn);

  const title = document.createElement('h3');
  title.className = 'ad-card-title';
  title.textContent = extractTitle(item.text);

  const description = createDescriptionBlock(extractDescription(item.text));

  const tags = document.createElement('div');
  tags.className = 'ad-card-tags';
  const tagLabels = new Set(['Ad Library', 'Landing Page']);
  if (item.brandName) tagLabels.add(getBrandName(item));
  if (item.platform) tagLabels.add(item.platform.replace(/-/g, ' '));
  if (item.pageUrl) tagLabels.add(getHostname(item.pageUrl));
  tagLabels.forEach((labelText) => tags.appendChild(createTagChip(labelText)));

  const footer = document.createElement('div');
  footer.className = 'ad-card-footer';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'ad-card-save-btn';
  saveButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 14-5-2.18L7 17V5h10v12z"/></svg><span>Save</span>';
  saveButton.addEventListener('click', (event) => {
    event.stopPropagation();
    handleCardSave(item);
  });

  footer.appendChild(saveButton);

  body.appendChild(brandHeader);
  body.appendChild(meta);
  body.appendChild(title);
  body.appendChild(description);
  body.appendChild(tags);
  body.appendChild(footer);

  card.appendChild(body);
  return card;
};

const renderItems = () => {
  const container = document.getElementById('cardGrid');
  if (!container) return;
  container.innerHTML = '';
  const filtered = applyFilters();

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<h3>No creatives yet</h3><p>Capture ads from Facebook or Instagram and they will appear here.</p>';
    container.appendChild(empty);
    return;
  }

  filtered.forEach((item) => {
    container.appendChild(createAdCard(item));
  });
};

const fetchItems = async () => {
  try {
    const data = await sendMessage('GET_AD_ITEMS');
    items = Array.isArray(data) ? data : [];
    renderItems();
  } catch (error) {
    console.error('Failed to load items:', error);
    const container = document.getElementById('cardGrid');
    if (container) {
      container.innerHTML = '<div class="empty-state">Unable to load your ads. Please try again.</div>';
    }
  }
};

const clearAllItems = async () => {
  if (!items.length) return;
  if (!confirm('Clear every saved ad? This cannot be undone.')) return;
  try {
    await sendMessage('CLEAR_ALL_ITEMS');
    items = [];
    renderItems();
  } catch (error) {
    console.error('Failed to clear items:', error);
    alert('Could not clear your library.');
  }
};

window.addEventListener('DOMContentLoaded', () => {
  bindEvent('.hero-search input', 'input', (event) => {
    searchQuery = event.target.value.trim();
    renderItems();
  });

  bindEvent('.clear-library', 'click', clearAllItems, { silent: true });

  fetchItems();
});

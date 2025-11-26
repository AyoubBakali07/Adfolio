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
const pendingDeletions = new Map();
let pendingClear = null;

const cancelPendingDeletions = () => {
  pendingDeletions.forEach(({ timer, toastDismiss }) => {
    if (timer) clearTimeout(timer);
    if (typeof toastDismiss === 'function') toastDismiss();
  });
  pendingDeletions.clear();
};

const ensureToastHost = () => {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  return host;
};

const showToast = ({ message, undoLabel, onUndo, type = 'default', duration = 4000 }) => {
  const host = ensureToastHost();
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`.trim();

  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);

  let timeoutId;

  if (undoLabel && typeof onUndo === 'function') {
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'toast-undo';
    undoBtn.textContent = undoLabel;
    undoBtn.addEventListener('click', () => {
      onUndo();
      clearTimeout(timeoutId);
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 200);
    });
    toast.appendChild(undoBtn);
  }

  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));

  timeoutId = setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 200);
  }, duration);

  return {
    dismiss: () => {
      clearTimeout(timeoutId);
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 200);
    }
  };
};

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

const getBrandName = (item) => {
  const name = (item.brandName && item.brandName.trim()) || '';
  if (name && name.toLowerCase() === 'sponsored') return 'Unknown brand';
  return name || 'Unknown brand';
};

const getHostname = (url) => {
  if (!url) return 'Unknown source';
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return 'Unknown source';
  }
};

const getParseAdText = () =>
  (typeof window !== 'undefined' && window.SwipekitText && window.SwipekitText.parseAdText) || null;

const parseAdCopy = (text, brandName = '') => {
  const parser = getParseAdText();
  if (parser) return parser(text || '', brandName);
  const fallback = (text || '').trim();
  return {
    rawText: text || '',
    fullAdCopy: fallback,
    primaryText: fallback,
    domain: '',
    headline: '',
    description: '',
    ctaLabel: ''
  };
};

const getAdCopy = (item) => {
  const extra = item?.extra || {};
  const source = (extra.fullAdCopy || extra.rawText || item?.text || '').trim();
  if (source) {
    const parsed = parseAdCopy(source, item?.brandName || '');
    if (parsed.primaryText) return parsed.primaryText;
    if (parsed.fullAdCopy) return parsed.fullAdCopy;
  }
  if (extra.adCopy) return extra.adCopy;
  const fallbackParsed = parseAdCopy(item?.text || '', item?.brandName || '');
  return fallbackParsed.primaryText || fallbackParsed.fullAdCopy || '';
};

const getLinkPreviewData = (item, primaryText) => {
  const extra = item?.extra || {};
  const parsed = (!extra.domain || !extra.headline || !extra.linkDescription || !extra.ctaLabel)
    ? parseAdCopy(extra.rawText || primaryText || '', item?.brandName || '')
    : { domain: '', headline: '', description: '', ctaLabel: '' };

  return {
    domain: extra.domain || parsed.domain || '',
    headline: extra.headline || parsed.headline || '',
    description: extra.linkDescription || parsed.description || '',
    ctaLabel: extra.ctaLabel || parsed.ctaLabel || '',
    linkUrl: extra.linkUrl || item.pageUrl || ''
  };
};

const applyFilters = () => {
  if (!searchQuery) return [...items];
  const term = searchQuery.toLowerCase();
  return items.filter((item) => {
    const haystack = [getAdCopy(item), item.platform, item.pageUrl]
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
    video.muted = true;
    video.playsInline = true;
    video.controls = true;
    video.src = videoUrl;
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

const createDescriptionBlock = (text) => {
  const description = text || 'No caption captured for this ad yet.';
  const container = document.createElement('div');
  container.className = 'ad-card-description collapsed';

  const paragraph = document.createElement('p');
  paragraph.textContent = description;
  container.appendChild(paragraph);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ad-card-toggle';
  toggle.textContent = 'Show more';
  toggle.addEventListener('click', () => {
    const expanded = container.classList.toggle('expanded');
    container.classList.toggle('collapsed', !expanded);
    toggle.textContent = expanded ? 'Show less' : 'Show more';
  });

  requestAnimationFrame(() => {
    const needsClamp = paragraph.scrollHeight - paragraph.clientHeight > 1;
    if (needsClamp) {
      container.appendChild(toggle);
    } else {
      container.classList.remove('collapsed');
    }
  });

  return container;
};

const createLinkPreview = (item, primaryText) => {
  const { domain, headline, description, ctaLabel, linkUrl } = getLinkPreviewData(item, primaryText);
  if (!domain && !headline && !description && !ctaLabel) return null;
  const container = document.createElement('div');
  container.className = 'ad-card-link-preview';

  if (domain) {
    const domainEl = document.createElement('p');
    domainEl.className = 'ad-card-link-domain';
    domainEl.textContent = domain.toUpperCase();
    container.appendChild(domainEl);
  }

  if (headline) {
    const headlineEl = document.createElement('p');
    headlineEl.className = 'ad-card-link-headline';
    headlineEl.textContent = headline;
    container.appendChild(headlineEl);
  }

  if (description) {
    const descEl = document.createElement('p');
    descEl.className = 'ad-card-link-description';
    descEl.textContent = description;
    container.appendChild(descEl);
  }

  if (ctaLabel) {
    const ctaBtn = document.createElement('button');
    ctaBtn.type = 'button';
    ctaBtn.className = 'ad-card-link-cta';
    ctaBtn.textContent = ctaLabel;
    ctaBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const target = linkUrl || item.pageUrl;
      if (target) window.open(target, '_blank', 'noopener');
    });
    container.appendChild(ctaBtn);
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

  const brandName = getBrandName(item);
  const hasCapturedBrand = Boolean((item.brandName || '').trim());

  const avatar = document.createElement('div');
  avatar.className = 'ad-card-brand-avatar';
  if (item.brandLogo) {
    const img = document.createElement('img');
    img.src = item.brandLogo;
    img.alt = `${brandName} logo`;
    avatar.appendChild(img);
  } else {
    avatar.textContent = brandName.charAt(0).toUpperCase();
  }

  const text = document.createElement('div');
  text.className = 'ad-card-brand-text';
  const title = document.createElement('p');
  title.className = 'ad-card-brand-name';
  title.textContent = brandName;
  const subtitle = document.createElement('p');
  subtitle.className = 'ad-card-brand-time';
  const relative = formatRelativeTime(item.capturedAt);
  const platform = (item.platform || 'Ad Library').replace(/-/g, ' ');
  subtitle.textContent = `Saved ${relative} · ${platform}`;
  text.appendChild(title);
  text.appendChild(subtitle);

  if (!hasCapturedBrand) {
    const warning = document.createElement('p');
    warning.className = 'ad-card-brand-warning';

    const dot = document.createElement('span');
    dot.className = 'ad-card-warning-dot';
    dot.setAttribute('aria-hidden', 'true');

    const message = document.createElement('span');
    message.textContent = 'Brand not detected in capture';

    warning.appendChild(dot);
    warning.appendChild(message);

    if (item.pageUrl) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'ad-card-brand-retry';
      retry.textContent = 'Retry capture';
      retry.addEventListener('click', (event) => {
        event.stopPropagation();
        window.open(item.pageUrl, '_blank', 'noopener');
      });
      warning.appendChild(retry);
    }

    text.appendChild(warning);
  }

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

const finalizeDelete = async (id) => {
  const pending = pendingDeletions.get(id);
  if (!pending) return;
  pendingDeletions.delete(id);
  clearTimeout(pending.timer);
  pending.toastDismiss();
  try {
    await sendMessage('DELETE_AD_ITEM', { id });
  } catch (error) {
    console.error('Failed to delete item:', error);
    const insertIndex = Math.min(pending.index, items.length);
    items.splice(insertIndex, 0, pending.item);
    renderItems();
    showToast({ message: 'Failed to delete ad. Restored.', type: 'error', duration: 3000 });
  }
};

const undoDelete = (id) => {
  const pending = pendingDeletions.get(id);
  if (!pending) return;
  pendingDeletions.delete(id);
  clearTimeout(pending.timer);
  pending.toastDismiss();
  const insertIndex = Math.min(pending.index, items.length);
  items.splice(insertIndex, 0, pending.item);
  renderItems();
};

const deleteItem = (id) => {
  if (!id) return;
  const index = items.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  const [item] = items.splice(index, 1);
  renderItems();

  const toastRef = showToast({
    message: `${getBrandName(item)} removed`,
    undoLabel: 'Undo',
    onUndo: () => undoDelete(id)
  });

  const timer = setTimeout(() => finalizeDelete(id), 4000);
  pendingDeletions.set(id, {
    item,
    index,
    timer,
    toastDismiss: toastRef.dismiss
  });
};

const DISALLOWED_TAGS = new Set(['ad library', 'facebook ad library', 'sponsored', 'web.facebook.com' ]);

const isAllowedTag = (label) => {
  if (!label) return false;
  const normalized = label.trim().toLowerCase();
  if (!normalized) return false;
  return !DISALLOWED_TAGS.has(normalized);
};

const isDegradedCapture = (item) => Boolean(item?.extra?.degradedCapture);

const createAdCard = (item) => {
  const card = document.createElement('article');
  card.className = 'ad-card';

  card.appendChild(createMediaElement(item));

  const body = document.createElement('div');
  body.className = 'ad-card-body';

  const brandHeader = createBrandHeader(item);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'ad-card-delete';
  deleteBtn.type = 'button';
  deleteBtn.innerHTML = '&times;';
  deleteBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    deleteItem(item.id);
  });

  const brandRow = document.createElement('div');
  brandRow.className = 'ad-card-brand-row';
  brandRow.appendChild(brandHeader);
  brandRow.appendChild(deleteBtn);

  const adCopy = getAdCopy(item);
  const description = createDescriptionBlock(adCopy);

  const tags = document.createElement('div');
  tags.className = 'ad-card-tags';
  const tagLabels = new Set();
  if (item.brandName) tagLabels.add(getBrandName(item));
  if (item.platform) tagLabels.add(item.platform.replace(/-/g, ' '));
  if (item.pageUrl) tagLabels.add(getHostname(item.pageUrl));
  if (isDegradedCapture(item)) tagLabels.add('Partial capture');
  tagLabels.forEach((labelText) => {
    if (isAllowedTag(labelText)) {
      const chip = createTagChip(labelText);
      if (labelText === 'Partial capture') {
        chip.classList.add('warning');
        chip.title = 'Capture completed with limited data';
      }
      tags.appendChild(chip);
    }
  });

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

  body.appendChild(brandRow);
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
  if (pendingClear) {
    clearTimeout(pendingClear.timer);
    pendingClear.toastDismiss?.();
    pendingClear = null;
  }

  const previousItems = [...items];
  cancelPendingDeletions();
  items = [];
  renderItems();

  const toastRef = showToast({
    message: 'Library cleared',
    undoLabel: 'Undo',
    onUndo: async () => {
      if (pendingClear) {
        clearTimeout(pendingClear.timer);
        pendingClear.toastDismiss?.();
        pendingClear = null;
        items = [...previousItems];
        renderItems();
        return;
      }
      try {
        await sendMessage('RESTORE_ITEMS', { items: previousItems });
        items = [...previousItems];
        renderItems();
      } catch (error) {
        console.error('Failed to restore library:', error);
        showToast({ message: 'Failed to restore library.', type: 'error', duration: 3000 });
      }
    },
    duration: 4000
  });

  const timer = setTimeout(async () => {
    pendingClear = null;
    try {
      await sendMessage('CLEAR_ALL_ITEMS');
    } catch (error) {
      console.error('Failed to clear items:', error);
      items = [...previousItems];
      renderItems();
      try {
        await sendMessage('RESTORE_ITEMS', { items: previousItems });
      } catch (restoreError) {
        console.error('Failed to restore after clear failure:', restoreError);
      }
      showToast({ message: 'Could not clear your library. Restored previous items.', type: 'error', duration: 4000 });
    }
  }, 4000);

  pendingClear = {
    timer,
    toastDismiss: toastRef.dismiss
  };
};

window.addEventListener('DOMContentLoaded', () => {
  if (!window.SwipekitText?.parseAdText) {
    console.warn('Swipekit dashboard: text parser not available; link previews and copy may be degraded');
  }

  bindEvent('.hero-search input', 'input', (event) => {
    searchQuery = event.target.value.trim();
    renderItems();
  });

  bindEvent('.clear-library', 'click', clearAllItems, { silent: true });

  fetchItems();
});

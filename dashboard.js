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

const getBrandName = (item) => (item.brandName && item.brandName.trim()) || 'Unknown brand';

const getHostname = (url) => {
  if (!url) return 'Unknown source';
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return 'Unknown source';
  }
};

const AD_COPY_NOISE = [
  /^active$/i,
  /^activelibrary id/i,
  /^library id/i,
  /^started running/i,
  /^platforms?/i,
  /^\d+\s+ads use this creative/i,
  /^open dropdown/i,
  /^see ad details/i,
  /^see summary details/i,
  /^see translation/i,
  /^sponsored$/i,
  /^facebook ad library/i,
  /^ad library\b/i,
  /^landing page\b/i,
  /^saved \d+/i,
  /^show more$/i,
  /^show less$/i
];
const TIMESTAMP_PATTERN = /\b\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}\b/;
const ELLIPSIS_LINE_PATTERN = /(…|\.\.\.)\s*$/;
const DOMAIN_ONLY_PATTERN = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;
const DOMAIN_INLINE_PATTERN = /[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i;
const CTA_LABELS = [
  'Shop Now',
  'Learn More',
  'Sign Up',
  'Order Now',
  'Subscribe',
  'Get Offer',
  'Contact Us',
  'Apply Now',
  'Download',
  'Install Now',
  'Watch More',
  'Book Now',
  'Get Quote',
  'See Menu',
  'Donate Now',
  'View Details'
];
const CTA_LABEL_SET = new Set(CTA_LABELS.map((label) => label.toLowerCase()));
const CTA_PATTERN = new RegExp(`\\b(${CTA_LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');

const normalizeLineKey = (line) =>
  line
    .toLowerCase()
    .replace(/…/g, '')
    .replace(/\.\s*$/, '')
    .replace(/\s+/g, ' ')
    .slice(0, 160);

const stripBrandPrefix = (line, brandName) => {
  if (!brandName) return line;
  const pattern = new RegExp(`^${brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*Sponsored\\s*`, 'i');
  const stripped = line.replace(pattern, '').trim();
  if (stripped) return stripped;
  const brandPattern = new RegExp(`^${brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return line.replace(brandPattern, '').trim();
};

const splitSegmentsByPattern = (segment, regex) => {
  const results = [];
  let remaining = segment;
  while (remaining) {
    const match = remaining.match(regex);
    if (!match || typeof match.index !== 'number') {
      if (remaining.trim()) results.push(remaining.trim());
      break;
    }
    const before = remaining.slice(0, match.index).trim();
    const after = remaining.slice(match.index + match[0].length).trim();
    if (before) results.push(before);
    results.push(match[0].trim());
    remaining = after;
  }
  return results;
};

const splitLineSegments = (line) => {
  let segments = [line];
  [DOMAIN_INLINE_PATTERN, CTA_PATTERN].forEach((regex) => {
    const buffer = [];
    segments.forEach((segment) => buffer.push(...splitSegmentsByPattern(segment, regex)));
    segments = buffer;
  });
  return segments;
};

const metadataPrefixPattern = /(activelibrary id|see ad details|open dropdown|summary details|total active time|platforms?)/i;

const removeMetadataPrefix = (line) => {
  const lower = line.toLowerCase();
  const idx = lower.lastIndexOf('sponsored');
  if (idx > -1) {
    const prefix = lower.slice(0, idx);
    if (metadataPrefixPattern.test(prefix)) {
      return line.slice(idx + 'sponsored'.length).trim();
    }
  }
  return line;
};

const cleanSegments = (text, brandName = '') => {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\u200b/g, '');
  const segments = [];
  normalized
    .split(/\n+/)
    .map((line) => removeMetadataPrefix(stripBrandPrefix(line.trim(), brandName)))
    .filter(Boolean)
    .map((line) => line.replace(TIMESTAMP_PATTERN, '').trim())
    .filter(Boolean)
    .forEach((line) => {
      splitLineSegments(line)
        .map((segment) => segment.trim())
        .filter(Boolean)
        .filter((segment) => !AD_COPY_NOISE.some((pattern) => pattern.test(segment)))
        .filter((segment) => !ELLIPSIS_LINE_PATTERN.test(segment))
        .forEach((segment) => segments.push(segment));
    });
  return segments;
};

const categorizeSegments = (segments) => {
  const primary = [];
  const descriptionParts = [];
  let domain = '';
  let headline = '';
  let ctaLabel = '';
  segments.forEach((segment) => {
    const normalized = segment.trim();
    if (!normalized) return;
    const lowered = normalized.toLowerCase();
    if (!ctaLabel && CTA_LABEL_SET.has(lowered)) {
      ctaLabel = normalized;
      return;
    }
    const domainCandidate = normalized.replace(/^https?:\/\//i, '');
    if (!domain && DOMAIN_ONLY_PATTERN.test(domainCandidate)) {
      domain = normalized;
      return;
    }
    if (domain && !headline) {
      headline = normalized;
      return;
    }
    if (domain && headline) {
      descriptionParts.push(normalized);
      return;
    }
    primary.push(normalized);
  });
  return {
    primaryText: primary.join('\n').trim(),
    domain,
    headline,
    description: descriptionParts.join('\n').trim(),
    ctaLabel
  };
};

const deriveTextSegments = (text, brandName = '') => {
  const segments = cleanSegments(text, brandName);
  const categorized = categorizeSegments(segments);
  if (!categorized.primaryText && text?.trim()) categorized.primaryText = text.trim();
  return categorized;
};

const getAdCopy = (item) => {
  const extra = item?.extra || {};
  const full = (extra.fullAdCopy || extra.rawText || item?.text || '').trim();
  if (full) return full;
  if (extra.adCopy) return extra.adCopy;
  const sourceText = extra.rawText || item?.text || '';
  const derived = deriveTextSegments(sourceText, item?.brandName || '');
  return derived.primaryText || sourceText || '';
};

const deriveLinkPreviewFromText = (text, brandName = '') => {
  if (!text) return {};
  const derived = deriveTextSegments(text, brandName);
  return {
    domain: derived.domain || '',
    headline: derived.headline || '',
    description: derived.description || '',
    ctaLabel: derived.ctaLabel || ''
  };
};

const getLinkPreviewData = (item, primaryText) => {
  const extra = item?.extra || {};
  const derived = (!extra.domain || !extra.headline || !extra.linkDescription || !extra.ctaLabel) && extra.rawText
    ? deriveLinkPreviewFromText(extra.rawText, item?.brandName || '')
    : {};
  return {
    domain: extra.domain || derived.domain || '',
    headline: extra.headline || derived.headline || '',
    description: extra.linkDescription || derived.description || '',
    ctaLabel: extra.ctaLabel || derived.ctaLabel || '',
    linkUrl: extra.linkUrl || item.pageUrl || ''
  };
};

const isValidRatio = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 5;

const getStoredAspectRatio = (item) => {
  const ratio = item?.extra?.aspectRatio;
  return isValidRatio(ratio) ? ratio : null;
};

const applyAspectRatio = (wrapper, ratio) => {
  if (isValidRatio(ratio)) {
    wrapper.style.setProperty('--media-aspect-ratio', ratio);
  } else {
    wrapper.style.removeProperty('--media-aspect-ratio');
  }
};

const watchMediaForAspectRatio = (media, wrapper) => {
  const update = () => {
    const width = media.videoWidth || media.naturalWidth || media.clientWidth || media.offsetWidth || 0;
    const height = media.videoHeight || media.naturalHeight || media.clientHeight || media.offsetHeight || 0;
    if (width > 0 && height > 0) {
      applyAspectRatio(wrapper, Number((width / height).toFixed(4)));
    }
  };
  if (media.tagName === 'VIDEO') {
    media.addEventListener('loadedmetadata', update, { once: true });
  } else {
    media.addEventListener('load', update, { once: true });
  }
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
  const storedRatio = getStoredAspectRatio(item);
  if (storedRatio) applyAspectRatio(wrapper, storedRatio);
  const videoUrl = Array.isArray(item.videoUrls) ? item.videoUrls.find(Boolean) : null;
  const imageUrl = Array.isArray(item.imageUrls) ? item.imageUrls.find(Boolean) : null;

  if (videoUrl) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.controls = true;
    if (!storedRatio) watchMediaForAspectRatio(video, wrapper);
    video.src = videoUrl;
    wrapper.appendChild(video);
    return wrapper;
  }

  if (imageUrl) {
    const image = document.createElement('img');
    if (!storedRatio) watchMediaForAspectRatio(image, wrapper);
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

const DISALLOWED_TAGS = new Set(['ad library', 'facebook ad library', 'sponsored', 'web.facebook.com']);

const isAllowedTag = (label) => {
  if (!label) return false;
  const normalized = label.trim().toLowerCase();
  if (!normalized) return false;
  return !DISALLOWED_TAGS.has(normalized);
};

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
  const tagLabels = new Set(['Landing Page']);
  if (item.brandName) tagLabels.add(getBrandName(item));
  if (item.platform) tagLabels.add(item.platform.replace(/-/g, ' '));
  if (item.pageUrl) tagLabels.add(getHostname(item.pageUrl));
  tagLabels.forEach((labelText) => {
    if (isAllowedTag(labelText)) {
      tags.appendChild(createTagChip(labelText));
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
  if (!confirm('Clear every saved ad? This cannot be undone.')) return;
  try {
    cancelPendingDeletions();
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

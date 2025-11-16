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

// Format date to relative time (e.g., "2 hours ago")
const formatRelativeTime = (dateString) => {
  if (!dateString) return 'Some time ago';
  
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return interval === 1 ? `${interval} ${unit} ago` : `${interval} ${unit}s ago`;
    }
  }
  
  return 'Just now';
};

const formatFullDate = (dateString) => {
  if (!dateString) return 'Unknown date';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const truncate = (text, limit = 120) => {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

const extractHighlights = (text, limit = 3) => {
  if (!text) return [];
  return text
    .split(/\n+/)
    .flatMap((chunk) => chunk.split(/(?<=[.!?])\s+/))
    .map((piece) => piece.trim())
    .filter(Boolean)
    .slice(0, limit);
};

const getHostname = (url) => {
  if (!url) return 'Source unknown';
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./i, '');
  } catch {
    return 'Source unknown';
  }
};

const formatDayDiff = (dateString) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
};

const applyFilters = () => {
  if (!searchQuery) return [...items];
  const normalized = searchQuery.toLowerCase();
  return items.filter((item) => {
    const haystack = [
      item.text || '',
      item.platform || '',
      item.brandName || '',
      item.pageUrl || ''
    ].join(' ').toLowerCase();
    return haystack.includes(normalized);
  });
};

const bindEvent = (selector, eventName, handler, { silent = false } = {}) => {
  const element = document.querySelector(selector);
  if (!element) {
    if (!silent) {
      console.warn(`Swipekit dashboard: element "${selector}" not found when binding ${eventName}`);
    }
    return null;
  }
  element.addEventListener(eventName, handler);
  return element;
};

const setClasses = (element, classes) => {
  element.className = Array.isArray(classes) ? classes.join(' ') : classes;
  return element;
};


const createAdCard = (item) => {
  const card = document.createElement('article');
  setClasses(card, [
    'w-full',
    'bg-white',
    'rounded-2xl',
    'border',
    'border-gray-200',
    'shadow-lg',
    'overflow-hidden',
    'font-sans',
    'flex',
    'flex-col'
  ]);
  
  const header = document.createElement('div');
  setClasses(header, ['flex', 'items-center', 'justify-between', 'p-4', 'pb-2']);
  
  const headerLeft = document.createElement('div');
  setClasses(headerLeft, ['flex', 'items-center', 'gap-3']);
  const avatar = document.createElement('div');
  setClasses(avatar, [
    'w-10',
    'h-10',
    'rounded-full',
    'bg-gray-900',
    'text-white',
    'flex',
    'items-center',
    'justify-center',
    'font-bold',
    'text-sm'
  ]);
  const brandName = item.brandName || (item.platform ? `${item.platform} Ad` : 'Saved creative');
  avatar.textContent = brandName.slice(0, 2).padEnd(2, ' ').trim() || 'AD';
  
  const headerInfo = document.createElement('div');
  const title = document.createElement('div');
  setClasses(title, ['text-[15px]', 'font-semibold', 'text-gray-900']);
  title.textContent = brandName;
  const subtitle = document.createElement('div');
  setClasses(subtitle, ['text-xs', 'text-gray-500']);
  subtitle.textContent = `Saved ${formatRelativeTime(item.capturedAt)}`;
  headerInfo.appendChild(title);
  headerInfo.appendChild(subtitle);
  
  headerLeft.appendChild(avatar);
  headerLeft.appendChild(headerInfo);
  
  const headerActions = document.createElement('div');
  setClasses(headerActions, ['flex', 'items-center', 'gap-3', 'text-gray-500', 'text-lg']);
  
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  setClasses(copyBtn, ['hover:text-gray-900', 'transition-colors', 'disabled:opacity-40']);
  copyBtn.innerHTML = '<i class="far fa-copy"></i>';
  copyBtn.title = 'Copy text';
  copyBtn.disabled = !item.text;
  copyBtn.addEventListener('click', async () => {
    if (!item.text) return;
    const original = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    copyBtn.disabled = true;
    try {
      await navigator.clipboard.writeText(item.text);
      copyBtn.innerHTML = '<i class="fas fa-check"></i>';
      setTimeout(() => {
        copyBtn.innerHTML = original;
        copyBtn.disabled = false;
      }, 1200);
    } catch (err) {
      console.error('Failed to copy:', err);
      copyBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
      setTimeout(() => {
        copyBtn.innerHTML = original;
        copyBtn.disabled = false;
      }, 1500);
    }
  });
  
  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  setClasses(moreBtn, ['hover:text-gray-900', 'transition-colors']);
  moreBtn.innerHTML = '<i class="fas fa-ellipsis-h"></i>';
  moreBtn.title = 'Open ad source';
  if (item.pageUrl) {
    moreBtn.addEventListener('click', () => window.open(item.pageUrl, '_blank', 'noopener'));
  } else {
    moreBtn.disabled = true;
    moreBtn.classList.add('opacity-40');
  }
  
  headerActions.appendChild(copyBtn);
  headerActions.appendChild(moreBtn);
  header.appendChild(headerLeft);
  header.appendChild(headerActions);
  card.appendChild(header);
  
  const mediaWrapper = document.createElement('div');
  setClasses(mediaWrapper, ['relative', 'w-full', 'bg-black', 'aspect-[9/16]', 'overflow-hidden']);
  
  const images = item.imageUrls || [];
  const videos = item.videoUrls || [];
  const hasVideo = videos.length > 0;
  if (hasVideo) {
    const video = document.createElement('video');
    video.src = videos[0];
    video.loop = true;
    video.muted = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.setAttribute('title', 'Ad creative video');
    setClasses(video, ['absolute', 'inset-0', 'w-full', 'h-full', 'object-cover']);
    mediaWrapper.appendChild(video);
  } else if (images.length > 0) {
    const img = document.createElement('img');
    img.src = images[0];
    img.alt = 'Ad creative';
    img.loading = 'lazy';
    setClasses(img, ['absolute', 'inset-0', 'w-full', 'h-full', 'object-cover']);
    mediaWrapper.appendChild(img);
  } else {
    mediaWrapper.classList.add('flex', 'items-center', 'justify-center', 'text-white', 'text-sm');
    mediaWrapper.textContent = 'No preview available';
  }
  
  const overlay = document.createElement('div');
  setClasses(overlay, ['absolute', 'inset-0', 'flex', 'flex-col', 'justify-end', 'p-4', 'text-white']);
  const highlights = extractHighlights(item.text);
  const pill = document.createElement('span');
  setClasses(pill, ['inline-block', 'bg-black/60', 'px-3', 'py-1', 'rounded-full', 'text-xs', 'mb-2']);
  pill.textContent = truncate(highlights[0] || 'Sponsored creative', 40);
  const overlayFooter = document.createElement('div');
  setClasses(overlayFooter, ['flex', 'items-center', 'justify-between', 'text-xs']);
  const overlayLeft = document.createElement('div');
  setClasses(overlayLeft, ['flex', 'items-center', 'gap-2']);
  const playBubble = document.createElement('div');
  setClasses(playBubble, [
    'w-7',
    'h-7',
    'rounded-full',
    'border',
    'border-white/50',
    'flex',
    'items-center',
    'justify-center',
    'bg-black/40',
    'text-[10px]'
  ]);
  playBubble.textContent = hasVideo ? '▶' : '⧉';
  const duration = document.createElement('span');
  duration.textContent = item.duration || (hasVideo ? '0:00' : (formatDayDiff(item.capturedAt) || ''));
  overlayLeft.appendChild(playBubble);
  overlayLeft.appendChild(duration);
  const expandIcon = document.createElement('span');
  expandIcon.textContent = '⛶';
  overlayFooter.appendChild(overlayLeft);
  overlayFooter.appendChild(expandIcon);
  overlay.appendChild(pill);
  overlay.appendChild(overlayFooter);
  mediaWrapper.appendChild(overlay);
  card.appendChild(mediaWrapper);
  
  if (item.text) {
    const textSection = document.createElement('div');
    setClasses(textSection, ['px-4', 'pt-3', 'pb-1', 'text-sm', 'text-gray-800']);
    const description = document.createElement('p');
    let expanded = false;
    const updateDescription = () => {
      description.textContent = expanded ? item.text : truncate(item.text, 160);
    };
    updateDescription();
    const toggleBtn = document.createElement('button');
    setClasses(toggleBtn, ['text-blue-600', 'cursor-pointer', 'mt-1', 'text-xs']);
    toggleBtn.textContent = 'Show more';
    toggleBtn.addEventListener('click', () => {
      expanded = !expanded;
      toggleBtn.textContent = expanded ? 'Show less' : 'Show more';
      updateDescription();
    });
    textSection.appendChild(description);
    textSection.appendChild(toggleBtn);
    card.appendChild(textSection);
  }
  
  const statusRow = document.createElement('div');
  setClasses(statusRow, ['flex', 'items-center', 'gap-2', 'px-4', 'py-2', 'text-sm', 'text-gray-600']);
  const statusIcon = document.createElement('span');
  statusIcon.textContent = '📉';
  const statusText = document.createElement('span');
  const dayLabel = formatDayDiff(item.capturedAt) || 'Some time';
  const statusLabel = item.status || 'Active';
  statusText.innerHTML = `<span class="font-semibold text-gray-900">${dayLabel}</span> – ${statusLabel}`;
  statusRow.appendChild(statusIcon);
  statusRow.appendChild(statusText);
  card.appendChild(statusRow);
  
  const ctas = document.createElement('div');
  setClasses(ctas, ['flex', 'gap-3', 'px-4', 'pb-3']);
  const createLinkButton = (label, href, primary = false) => {
    const btn = document.createElement(href ? 'a' : 'button');
    if (href) {
      btn.href = href;
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
    } else {
      btn.type = 'button';
      btn.disabled = true;
    }
    setClasses(btn, [
      'flex-1',
      'text-sm',
      'rounded-full',
      'py-2',
      primary ? 'bg-gray-900 text-white' : 'bg-gray-100 border border-gray-300 text-gray-900',
      'text-center'
    ]);
    if (!href) {
      btn.classList.add('opacity-60', 'cursor-not-allowed');
    }
    btn.textContent = label;
    return btn;
  };
  const adLibraryBtn = createLinkButton('Ad Library', item.pageUrl || null, true);
  const landingHref = item.landingPageUrl || images[0] || videos[0] || null;
  const landingBtn = createLinkButton('Landing page', landingHref, false);
  ctas.appendChild(adLibraryBtn);
  ctas.appendChild(landingBtn);
  card.appendChild(ctas);
  
  const footer = document.createElement('div');
  setClasses(footer, ['border-t', 'border-gray-200', 'px-4', 'py-3', 'flex', 'items-center', 'justify-between', 'text-sm', 'text-gray-800']);
  const footerLabel = document.createElement('span');
  setClasses(footerLabel, ['tracking-[0.4em]', 'font-semibold']);
  footerLabel.textContent = getHostname(item.pageUrl).toUpperCase();
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  setClasses(deleteBtn, ['text-xl', 'text-gray-500', 'hover:text-red-500', 'transition-colors']);
  deleteBtn.textContent = '🗑️';
  deleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    deleteItem(item.id);
  });
  footer.appendChild(footerLabel);
  footer.appendChild(deleteBtn);
  card.appendChild(footer);
  
  return card;
};


const renderItems = () => {
  const container = document.getElementById('cardGrid');
  container.innerHTML = '';
  
  const filtered = applyFilters();
  
  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'col-span-full border border-dashed border-gray-300 rounded-2xl bg-white p-10 text-center text-gray-500 shadow-sm';
    empty.innerHTML = `
      <i class="fas fa-inbox fa-3x text-gray-300 mb-3"></i>
      <h3 class="text-xl font-semibold text-gray-900">No creatives found</h3>
      <p class="text-sm text-gray-500">${items.length ? 'Try adjusting your search or filters' : 'Start by capturing some ads'}</p>
    `;
    container.appendChild(empty);
    return;
  }
  
  filtered.forEach(item => {
    const card = createAdCard(item);
    container.appendChild(card);
  });
};

// Fetch items from storage
const fetchItems = async () => {
  try {
    const data = await sendMessage('GET_AD_ITEMS');
    items = Array.isArray(data) ? data : [];
    renderItems();
  } catch (error) {
    console.error('Failed to load items:', error);
    // Show error state
    const container = document.getElementById('cardGrid');
    container.innerHTML = `
      <div class="col-span-full border border-dashed border-red-200 rounded-2xl bg-white p-10 text-center text-red-500 shadow-sm">
        <i class="fas fa-exclamation-triangle fa-3x text-red-300 mb-3"></i>
        <h3 class="text-xl font-semibold text-gray-900">Failed to load items</h3>
        <p class="text-sm text-gray-500">${error.message || 'Please try again later'}</p>
      </div>
    `;
  }
};

// Delete an item
const deleteItem = async (id) => {
  if (!confirm('Are you sure you want to delete this item?')) return;
  
  try {
    await sendMessage('DELETE_AD_ITEM', { id });
    items = items.filter(item => item.id !== id);
    renderItems();
  } catch (error) {
    console.error('Failed to delete item:', error);
    alert('Failed to delete item. Please try again.');
  }
};

// Clear all items
const clearAllItems = async () => {
  if (!items.length || !confirm('Are you sure you want to delete all saved items? This cannot be undone.')) {
    return;
  }
  
  try {
    await sendMessage('CLEAR_ALL_ITEMS');
    items = [];
    renderItems();
  } catch (error) {
    console.error('Failed to clear items:', error);
    alert('Failed to clear items. Please try again.');
  }
};

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  // Search functionality
  bindEvent('.search-bar input', 'input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderItems();
  });
  
  // Clear all button
  bindEvent('.clear-all', 'click', clearAllItems, { silent: true });
  
  // Fetch initial data
  fetchItems();
  
  // Add active class to current nav item
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('href') === currentPath) {
      item.classList.add('active');
    }
  });
  
  // Toggle sidebar on mobile
  const sidebar = document.querySelector('.sidebar');
  bindEvent('.sidebar-toggle', 'click', () => {
    sidebar?.classList.toggle('open');
  }, { silent: true });
});

// Handle window resize for responsive behavior
window.addEventListener('resize', () => {
  // Close sidebar when resizing to mobile
  if (window.innerWidth < 768) {
    document.querySelector('.sidebar')?.classList.remove('open');
  }
});

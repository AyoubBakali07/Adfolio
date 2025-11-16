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
    'flex',
    'flex-col',
    'gap-5',
    'rounded-2xl',
    'border',
    'border-gray-200',
    'bg-white',
    'shadow-xl'
  ]);
  
  const statusRow = document.createElement('div');
  setClasses(statusRow, ['flex', 'items-center', 'justify-between', 'px-6', 'pt-6']);
  
  const statusText = item.status || 'Active';
  const statusPill = document.createElement('span');
  const isActive = statusText.toLowerCase().includes('active');
  setClasses(statusPill, [
    'inline-flex',
    'items-center',
    'gap-2',
    'text-xs',
    'font-semibold',
    'px-3',
    'py-1',
    'rounded-full',
    isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
  ]);
  const statusDot = document.createElement('span');
  setClasses(statusDot, ['w-2', 'h-2', 'rounded-full', 'bg-current']);
  statusPill.appendChild(statusDot);
  statusPill.append(statusText);
  
  const savedAt = document.createElement('span');
  setClasses(savedAt, ['text-xs', 'text-gray-500']);
  savedAt.textContent = `Saved ${formatRelativeTime(item.capturedAt)}`;
  
  const deleteBtn = document.createElement('button');
  setClasses(deleteBtn, ['text-gray-400', 'hover:text-red-500', 'transition-colors', 'text-lg']);
  deleteBtn.setAttribute('aria-label', 'Delete saved creative');
  deleteBtn.innerHTML = '<i class="far fa-trash-alt"></i>';
  deleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    deleteItem(item.id);
  });
  
  const statusMeta = document.createElement('div');
  setClasses(statusMeta, ['flex', 'flex-col', 'gap-1']);
  statusMeta.appendChild(statusPill);
  statusMeta.appendChild(savedAt);
  
  statusRow.appendChild(statusMeta);
  statusRow.appendChild(deleteBtn);
  card.appendChild(statusRow);
  
  const metaGrid = document.createElement('div');
  setClasses(metaGrid, ['grid', 'grid-cols-1', 'sm:grid-cols-3', 'gap-4', 'px-6']);
  
  const libraryId = item.libraryId || (item.id || '').split('-').pop() || item.id || '—';
  const metaItems = [
    { label: 'Library ID', value: libraryId.toString().toUpperCase() },
    { label: 'Captured', value: formatFullDate(item.capturedAt) },
    { label: 'Platform', value: item.platform || 'Unknown platform' }
  ];
  
  metaItems.forEach(({ label, value }) => {
    const metaItem = document.createElement('div');
    setClasses(metaItem, ['flex', 'flex-col', 'gap-1']);
    
    const metaLabel = document.createElement('span');
    setClasses(metaLabel, ['text-[0.65rem]', 'uppercase', 'tracking-[0.3em]', 'text-gray-400']);
    metaLabel.textContent = label;
    
    const metaValue = document.createElement('span');
    setClasses(metaValue, ['text-sm', 'font-semibold', 'text-gray-800', 'inline-flex', 'items-center', 'gap-2']);
    if (label === 'Platform') {
      const icon = document.createElement('i');
      const platform = value.toLowerCase();
      icon.className = platform.includes('instagram')
        ? 'fab fa-instagram text-indigo-500'
        : 'fab fa-facebook text-indigo-500';
      metaValue.appendChild(icon);
      const platformText = document.createElement('span');
      platformText.textContent = value;
      metaValue.appendChild(platformText);
    } else {
      metaValue.textContent = value;
    }
    
    metaItem.appendChild(metaLabel);
    metaItem.appendChild(metaValue);
    metaGrid.appendChild(metaItem);
  });
  
  card.appendChild(metaGrid);
  
  const actions = document.createElement('div');
  setClasses(actions, ['flex', 'flex-col', 'sm:flex-row', 'gap-3', 'px-6']);
  
  const adLink = document.createElement('a');
  setClasses(adLink, [
    'flex-1',
    'inline-flex',
    'items-center',
    'justify-center',
    'gap-2',
    'rounded-full',
    'border',
    'border-gray-200',
    'text-gray-900',
    'font-semibold',
    'py-2.5',
    'px-4',
    'hover:border-gray-300',
    'transition-colors'
  ]);
  adLink.href = item.pageUrl || '#';
  adLink.target = '_blank';
  adLink.rel = 'noopener noreferrer';
  adLink.innerHTML = '<i class="fas fa-external-link-alt"></i> See ad details';
  
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  setClasses(copyBtn, [
    'flex-1',
    'inline-flex',
    'items-center',
    'justify-center',
    'gap-2',
    'rounded-full',
    'bg-gradient-to-r',
    'from-indigo-500',
    'to-indigo-600',
    'text-white',
    'font-semibold',
    'py-2.5',
    'px-4',
    'shadow-lg',
    'hover:from-indigo-600',
    'hover:to-indigo-700',
    'transition-colors',
    'disabled:opacity-60',
    'disabled:cursor-not-allowed'
  ]);
  copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy text';
  copyBtn.disabled = !item.text;
  copyBtn.addEventListener('click', async () => {
    if (!item.text) return;
    const original = copyBtn.innerHTML;
    copyBtn.disabled = true;
    copyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Copying...';
    try {
      await navigator.clipboard.writeText(item.text);
      copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
      setTimeout(() => {
        copyBtn.innerHTML = original;
        copyBtn.disabled = false;
      }, 1400);
    } catch (err) {
      console.error('Failed to copy:', err);
      copyBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed';
      setTimeout(() => {
        copyBtn.innerHTML = original;
        copyBtn.disabled = false;
      }, 1800);
    }
  });
  
  actions.appendChild(adLink);
  actions.appendChild(copyBtn);
  card.appendChild(actions);
  
  const brandRow = document.createElement('div');
  setClasses(brandRow, ['flex', 'items-center', 'gap-4', 'px-6']);
  const avatar = document.createElement('div');
  setClasses(avatar, [
    'w-12',
    'h-12',
    'rounded-xl',
    'bg-indigo-100',
    'text-indigo-600',
    'flex',
    'items-center',
    'justify-center',
    'font-semibold',
    'text-lg',
    'uppercase'
  ]);
  const brandName = item.brandName || (item.platform ? `${item.platform} Ad` : 'Saved creative');
  avatar.textContent = brandName.charAt(0).toUpperCase();
  
  const brandInfo = document.createElement('div');
  setClasses(brandInfo, ['flex', 'flex-col', 'gap-1']);
  const brandTitle = document.createElement('div');
  setClasses(brandTitle, ['font-semibold', 'text-gray-900']);
  brandTitle.textContent = brandName;
  const brandMeta = document.createElement('div');
  setClasses(brandMeta, ['text-xs', 'text-gray-500', 'uppercase', 'tracking-widest']);
  brandMeta.textContent = `Sponsored • ${getHostname(item.pageUrl)}`;
  
  brandInfo.appendChild(brandTitle);
  brandInfo.appendChild(brandMeta);
  brandRow.appendChild(avatar);
  brandRow.appendChild(brandInfo);
  card.appendChild(brandRow);
  
  if (item.text) {
    const description = document.createElement('p');
    setClasses(description, ['px-6', 'text-sm', 'text-gray-700']);
    description.textContent = truncate(item.text, 200);
    card.appendChild(description);
  }
  
  const highlights = extractHighlights(item.text);
  if (highlights.length > 1) {
    const list = document.createElement('ul');
    setClasses(list, ['px-6', 'space-y-2', 'text-sm', 'text-gray-700']);
    highlights.forEach((line) => {
      const li = document.createElement('li');
      setClasses(li, ['flex', 'items-center', 'gap-2']);
      const icon = document.createElement('i');
      icon.className = 'fas fa-check-circle text-emerald-500';
      li.appendChild(icon);
      li.append(line);
      list.appendChild(li);
    });
    card.appendChild(list);
  }
  
  // Media section (image or video)
  const mediaContainer = document.createElement('div');
  setClasses(mediaContainer, ['w-full', 'h-80', 'bg-slate-100', 'border-t', 'border-gray-100', 'overflow-hidden']);
  
  const images = item.imageUrls || [];
  const videos = item.videoUrls || [];
  
  if (videos.length > 0) {
    const video = document.createElement('video');
    video.src = videos[0];
    video.controls = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('title', 'Ad creative video');
    setClasses(video, ['w-full', 'h-full', 'object-cover']);
    mediaContainer.appendChild(video);
  } else if (images.length > 0) {
    const img = document.createElement('img');
    img.src = images[0];
    img.alt = 'Ad creative';
    img.loading = 'lazy';
    setClasses(img, ['w-full', 'h-full', 'object-cover']);
    mediaContainer.appendChild(img);
  }
  
  card.appendChild(mediaContainer);
  
  const footer = document.createElement('div');
  setClasses(footer, ['px-6', 'pb-6', 'flex', 'items-center', 'justify-between', 'text-sm', 'text-gray-500']);
  const domain = document.createElement('div');
  setClasses(domain, ['font-semibold', 'text-gray-800']);
  domain.textContent = getHostname(item.pageUrl);
  
  const platformTag = document.createElement('span');
  setClasses(platformTag, [
    'text-[0.65rem]',
    'uppercase',
    'tracking-[0.3em]',
    'text-indigo-600',
    'bg-indigo-50',
    'px-3',
    'py-1',
    'rounded-full'
  ]);
  platformTag.textContent = item.platform || 'Unknown';
  
  footer.appendChild(domain);
  footer.appendChild(platformTag);
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

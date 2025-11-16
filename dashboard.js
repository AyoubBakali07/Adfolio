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

const truncate = (text, limit = 120) => {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
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

const createAdCard = (item) => {
  const card = document.createElement('article');
  card.className = 'ad-card';
  
  // Media section (image or video)
  const mediaContainer = document.createElement('div');
  mediaContainer.className = 'ad-media';
  
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
    mediaContainer.appendChild(video);
  } else if (images.length > 0) {
    const img = document.createElement('img');
    img.src = images[0];
    img.alt = 'Ad creative';
    img.loading = 'lazy';
    mediaContainer.appendChild(img);
  }
  
  // Content section
  const content = document.createElement('div');
  content.className = 'ad-content';
  
  // Header with platform and timestamp
  const header = document.createElement('div');
  header.className = 'ad-header';
  
  const platform = document.createElement('div');
  platform.className = 'ad-platform';
  platform.textContent = item.platform || 'AD';
  
  const timestamp = document.createElement('div');
  timestamp.className = 'ad-timestamp';
  timestamp.textContent = formatRelativeTime(item.capturedAt);
  
  header.appendChild(platform);
  header.appendChild(timestamp);
  
  // Brand and title
  const details = document.createElement('div');
  details.className = 'ad-details';
  
  if (item.brandName) {
    const brand = document.createElement('div');
    brand.className = 'ad-brand';
    brand.textContent = item.brandName;
    details.appendChild(brand);
  }
  
  if (item.text) {
    const description = document.createElement('div');
    description.className = 'ad-description';
    description.textContent = truncate(item.text);
    details.appendChild(description);
  }
  
  // Meta information
  const meta = document.createElement('div');
  meta.className = 'ad-meta';
  
  if (item.platform) {
    const platformMeta = document.createElement('div');
    platformMeta.className = 'meta-item';
    platformMeta.innerHTML = `<i class="fas fa-mobile-alt"></i> ${item.platform}`;
    meta.appendChild(platformMeta);
  }
  
  if (item.duration) {
    const duration = document.createElement('div');
    duration.className = 'meta-item';
    duration.innerHTML = `<i class="far fa-clock"></i> ${item.duration}`;
    meta.appendChild(duration);
  }
  
  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'ad-actions';
  
  const viewSource = document.createElement('a');
  viewSource.className = 'btn btn-outline';
  viewSource.href = item.pageUrl || '#';
  viewSource.target = '_blank';
  viewSource.rel = 'noopener noreferrer';
  viewSource.innerHTML = '<i class="fas fa-external-link-alt"></i> View source';
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-danger';
  deleteBtn.innerHTML = '<i class="far fa-trash-alt"></i>';
  deleteBtn.title = 'Delete';
  deleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    deleteItem(item.id);
  });
  
  actions.appendChild(viewSource);
  actions.appendChild(deleteBtn);
  
  // Assemble the card
  content.appendChild(header);
  content.appendChild(details);
  content.appendChild(meta);
  content.appendChild(actions);
  
  card.appendChild(mediaContainer);
  card.appendChild(content);
  
  return card;
};

const renderItems = () => {
  const container = document.getElementById('cardGrid');
  container.innerHTML = '';
  
  const filtered = applyFilters();
  
  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <i class="fas fa-inbox fa-3x"></i>
      <h3>No creatives found</h3>
      <p>${items.length ? 'Try adjusting your search or filters' : 'Start by capturing some ads'}</p>
    `;
    container.appendChild(empty);
    return;
  }
  
  filtered.forEach(item => {
    const card = createAdCard(item);
    container.appendChild(card);
  });};

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
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle fa-3x"></i>
        <h3>Failed to load items</h3>
        <p>${error.message || 'Please try again later'}</p>
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

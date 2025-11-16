(() => {
  const CARD_ATTR = 'data-swipekit-lite';
  const STYLE_ID = 'swipekit-lite-styles';
  const SELECTORS = {
    'facebook-feed': "div[role='article']",
    instagram: 'article'
  };

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .swipekit-save-btn-wrapper {
        width: 100%;
        margin-top: 12px;
      }
      .swipekit-save-btn-clean {
        width: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 999px;
        background: #f8f7f4;
        border: 1px solid rgba(15, 23, 42, 0.1);
        color: #111827;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.01em;
        text-transform: none;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
        transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      }
      .swipekit-save-btn-clean:hover {
        background: #fff;
        border-color: rgba(15, 23, 42, 0.2);
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
      }
      .swipekit-save-btn-clean:disabled {
        opacity: 0.6;
        cursor: default;
        box-shadow: none;
      }
      .swipekit-save-btn-icon {
        display: inline-flex;
      }
      .swipekit-save-btn-icon svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
      }
      .swipekit-toast {
        position: fixed;
        right: 24px;
        bottom: 24px;
        background: #141414;
        color: #fff;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        font-size: 14px;
        z-index: 2147483647;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      .swipekit-toast.swipekit-visible {
        opacity: 0.95;
        transform: translateY(0);
      }
    `;
    document.documentElement.appendChild(style);
  };

  const createId = () => (crypto?.randomUUID ? crypto.randomUUID() : `swipe-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const getUrlInfo = () => {
    const url = window.location.href.toLowerCase();
    const isFacebook = url.includes('facebook.com');
    const isInstagram = url.includes('instagram.com');
    const isAdLibrary = isFacebook && /\/ads\/(library|archive)/.test(url);
    return { isFacebook, isInstagram, isAdLibrary };
  };

  const detectPlatform = () => {
    const info = getUrlInfo();
    if (info.isInstagram) return 'instagram';
    if (info.isAdLibrary) return 'facebook-ad-library';
    return 'facebook-feed';
  };

  const normalizeUrl = (value) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('data:')) return null;
    try {
      return new URL(trimmed, window.location.href).toString();
    } catch {
      return trimmed;
    }
  };

  const getImageCandidates = (card) => {
    const candidates = [];
    card.querySelectorAll('img').forEach((img) => {
      const source = normalizeUrl(img.currentSrc || img.src);
      if (!source) return;
      const rect = img.getBoundingClientRect();
      const width = Math.round(rect.width || img.naturalWidth || img.width || 0);
      const height = Math.round(rect.height || img.naturalHeight || img.height || 0);
      candidates.push({ source, width, height, area: width * height });
    });

    if (!candidates.length) return [];

    const MIN_DIMENSION = 140;
    const large = candidates.filter(({ width, height, area }) => {
      if (!width || !height) return false;
      if (width >= MIN_DIMENSION || height >= MIN_DIMENSION) return true;
      return area >= MIN_DIMENSION * MIN_DIMENSION;
    });

    const prioritized = (large.length ? large : candidates).sort((a, b) => b.area - a.area);
    return prioritized;
  };

  const collectImages = (card) => {
    const prioritized = getImageCandidates(card);
    if (!prioritized.length) return [];
    const seen = new Set();
    return prioritized
      .map(({ source }) => source)
      .filter((src) => {
        if (seen.has(src)) return false;
        seen.add(src);
        return true;
      });
  };

  const collectBrandInfo = (card) => {
    let brandName = '';
    const nameSelectors = [
      'strong a',
      'strong span',
      '[role="heading"] a',
      '[role="heading"] span',
      'h3 a',
      'h3 span',
      'h4 a',
      'h4 span'
    ];
    for (const selector of nameSelectors) {
      const node = card.querySelector(selector);
      if (node) {
        const text = sanitize(node.textContent || '');
        if (text) {
          brandName = text.split('•')[0].trim();
          break;
        }
      }
    }
    if (!brandName) {
      const fallback = card.querySelector('strong, h3, h4, [role="heading"]');
      if (fallback) brandName = sanitize(fallback.textContent || '').split('•')[0].trim();
    }

    const potentialLogos = Array.from(card.querySelectorAll('img'))
      .map((img) => {
        const source = normalizeUrl(img.currentSrc || img.src);
        if (!source) return null;
        const rect = img.getBoundingClientRect();
        const width = Math.round(rect.width || img.naturalWidth || img.width || 0);
        const height = Math.round(rect.height || img.naturalHeight || img.height || 0);
        const alt = (img.getAttribute('alt') || '').toLowerCase();
        return { img, source, width, height, alt };
      })
      .filter(Boolean)
      .filter(({ width, height }) => width && height && width <= 160 && height <= 160);

    let brandLogo = null;
    const logoMatch = potentialLogos.find(({ width, height, alt }) => {
      if (!width || !height) return false;
      const approxSquare = Math.abs(width - height) <= Math.min(width, height) * 0.4;
      if (alt.includes('profile') || alt.includes('logo')) return true;
      return approxSquare && width <= 120 && height <= 120;
    });
    if (logoMatch) brandLogo = logoMatch.source;

    return { brandName, brandLogo };
  };

  const getVideoCandidates = (card) => {
    const candidates = [];
    card.querySelectorAll('video').forEach((video) => {
      const rect = video.getBoundingClientRect();
      const width = Math.round(video.videoWidth || rect.width || video.clientWidth || 0);
      const height = Math.round(video.videoHeight || rect.height || video.clientHeight || 0);
      const area = width && height ? width * height : 0;
      const urls = new Set();
      [video.currentSrc, video.src].forEach((value) => {
        const normalized = normalizeUrl(value);
        if (normalized) urls.add(normalized);
      });
      video.querySelectorAll('source').forEach((source) => {
        const normalized = normalizeUrl(source.src);
        if (normalized) urls.add(normalized);
      });
      if (urls.size) candidates.push({ urls: Array.from(urls), width, height, area });
    });
    return candidates.sort((a, b) => b.area - a.area);
  };

  const collectVideos = (card) => {
    const urls = new Set();
    getVideoCandidates(card).forEach(({ urls: videoUrls }) => {
      videoUrls.forEach((url) => urls.add(url));
    });
    return Array.from(urls);
  };

  const detectAspectRatio = (card) => {
    const firstVideo = getVideoCandidates(card).find(({ width, height }) => width > 0 && height > 0);
    if (firstVideo) return Number((firstVideo.width / firstVideo.height).toFixed(4));
    const firstImage = getImageCandidates(card).find(({ width, height }) => width > 0 && height > 0);
    if (firstImage) return Number((firstImage.width / firstImage.height).toFixed(4));
    return null;
  };

  const sanitize = (text) => text.replace(/\s+/g, ' ').trim();

  const getCardText = (card) => {
    const clone = card.cloneNode(true);
    clone.querySelectorAll('.swipekit-save-btn-wrapper').forEach((node) => node.remove());
    const text = clone.innerText || '';
    return text.replace(/\u200b/g, '').replace(/\r\n/g, '\n').trim();
  };

  const AD_COPY_NOISE = [
    /^activelibrary id/i,
    /^started running/i,
    /^platforms/i,
    /^open dropdown/i,
    /^see ad details/i,
    /^sponsored$/i,
    /^facebook ad library/i,
    /^ad library\b/i,
    /^landing page\b/i,
    /^saved \d+/i,
    /^show more$/i,
    /^show less$/i
  ];

  const cleanAdCopyText = (text) => {
    if (!text) return '';
    const normalized = text.replace(/\r\n/g, '\n').replace(/\u200b/g, '');
    const lines = normalized
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !AD_COPY_NOISE.some((pattern) => pattern.test(line)));
    if (lines.length) return lines.join('\n').trim();
    const markers = ['see ad details', 'sponsored'];
    const lower = normalized.toLowerCase();
    for (const marker of markers) {
      const index = lower.indexOf(marker);
      if (index !== -1) {
        const slice = normalized.slice(index + marker.length).trim();
        if (slice) return slice;
      }
    }
    return normalized.trim();
  };

  const getAdCopyData = (card) => {
    const rawText = getCardText(card);
    const adCopy = cleanAdCopyText(rawText) || rawText;
    return { rawText, adCopy };
  };

  const captureCard = (card) => {
    const { brandName, brandLogo } = collectBrandInfo(card);
    const { rawText, adCopy } = getAdCopyData(card);
    const aspectRatio = detectAspectRatio(card);
    const payload = {
      id: createId(),
      platform: detectPlatform(),
      capturedAt: new Date().toISOString(),
      pageUrl: window.location.href,
      text: adCopy,
      imageUrls: collectImages(card),
      videoUrls: collectVideos(card),
      brandName,
      brandLogo,
      extra: {}
    };
    if (aspectRatio && Number.isFinite(aspectRatio)) {
      payload.extra.aspectRatio = aspectRatio;
    }
    payload.extra.rawText = rawText;
    payload.extra.adCopy = adCopy;
    return payload;
  };

  const showToast = (message, isError = false) => {
    const toast = document.createElement('div');
    toast.className = 'swipekit-toast';
    toast.textContent = message;
    if (isError) toast.style.background = '#c0352b';
    (document.body || document.documentElement).appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('swipekit-visible'));
    setTimeout(() => {
      toast.classList.remove('swipekit-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  };

  const updateButtonLabel = (button, value) => {
    const label = button.querySelector('.swipekit-save-btn-label');
    if (label) label.textContent = value;
  };

  const handleSave = (card, button) => {
    const payload = captureCard(card);
    if (!payload.text && !payload.imageUrls.length && !payload.videoUrls.length) {
      showToast('Swipekit: nothing to capture', true);
      return;
    }
    button.disabled = true;
    const original = button.dataset.defaultLabel || 'Save';
    updateButtonLabel(button, 'Saving...');
    chrome.runtime.sendMessage({ type: 'SAVE_AD_ITEM', item: payload }, (response) => {
      button.disabled = false;
      if (chrome.runtime.lastError || !response?.ok) {
        updateButtonLabel(button, original);
        showToast('Swipekit save failed', true);
        return;
      }
      updateButtonLabel(button, 'Saved');
      showToast('Saved to Swipe');
      setTimeout(() => updateButtonLabel(button, original), 1500);
    });
  };

  const createSaveButton = (card) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swipekit-save-btn-clean';
    button.dataset.defaultLabel = 'Save';

    const icon = document.createElement('span');
    icon.className = 'swipekit-save-btn-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 14-5-2.18L7 17V5h10v12z"/></svg>';

    const label = document.createElement('span');
    label.className = 'swipekit-save-btn-label';
    label.textContent = 'Save';

    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleSave(card, button);
    });
    return button;
  };

  const matchesAdLibraryCard = (node) => {
    const text = node?.textContent?.toLowerCase() || '';
    return /ad library|see ad details|library id|inactive|active on/.test(text);
  };

  const findAnchor = (card) => {
    const detail = card.querySelector('[aria-label*="ad details" i], [href*="/ads/library"], [data-testid*="ad-details"]');
    if (detail) {
      const cluster = detail.closest('div[role="button"]') || detail.parentElement;
      if (cluster?.parentElement) return cluster;
    }
    return card.querySelector('[role="group"], [role="toolbar"], footer') || card.lastElementChild || card;
  };

  const mountButton = (card) => {
    if (card.hasAttribute(CARD_ATTR)) return;
    if (card.querySelector('.swipekit-save-btn-clean')) return;
    const button = createSaveButton(card);
    const wrapper = document.createElement('div');
    wrapper.className = 'swipekit-save-btn-wrapper';
    wrapper.appendChild(button);
    const anchor = findAnchor(card);
    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(wrapper, anchor.nextSibling);
    } else {
      card.appendChild(wrapper);
    }
    card.setAttribute(CARD_ATTR, 'true');
  };

  const getCardCandidates = () => {
    const platform = detectPlatform();
    if (platform === 'facebook-ad-library') {
      return Array.from(document.querySelectorAll('div.x1plvlek, div[role="article"], div[data-pagelet^="FeedUnit"]'))
        .filter((node) => node.offsetParent && matchesAdLibraryCard(node));
    }
    const selector = SELECTORS[platform];
    if (!selector) return [];
    return Array.from(document.querySelectorAll(selector)).filter((node) => node.offsetParent);
  };

  const scan = () => {
    const cards = getCardCandidates();
    cards.forEach((card) => {
      try {
        mountButton(card);
      } catch (error) {
        console.error('Swipekit Lite button error', error);
      }
    });
  };

  const init = () => {
    injectStyles();
    scan();
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length)) {
        scan();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(scan, 2000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

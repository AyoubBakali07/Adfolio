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

  const parseSrcsetDescriptor = (descriptor) => {
    const match = descriptor.trim().match(/(\d+(?:\.\d+)?)(w|x)/i);
    if (!match) return 0;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return 0;
    return match[2].toLowerCase() === 'x' ? value * 1000 : value;
  };

  const collectSrcsetEntries = (srcset, register) => {
    if (!srcset) return;
    srcset
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry, index) => {
        const parts = entry.split(/\s+/);
        const url = normalizeUrl(parts[0]);
        if (!url) return;
        const descriptor = parts[1] || '';
        const score = descriptor ? parseSrcsetDescriptor(descriptor) : index + 1;
        register(url, score);
      });
  };

  const getBestImageSource = (img) => {
    const scores = new Map();
    const register = (url, score) => {
      if (!url) return;
      const existing = scores.get(url);
      if (typeof existing === 'number' && existing >= score) return;
      scores.set(url, score);
    };
    collectSrcsetEntries(img.getAttribute('srcset'), register);
    const picture = img.closest('picture');
    if (picture) {
      picture.querySelectorAll('source').forEach((source) => {
        collectSrcsetEntries(source.getAttribute('srcset'), register);
      });
    }
    if (scores.size) {
      return Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([url]) => url)[0];
    }
    return normalizeUrl(img.currentSrc || img.src);
  };

  const getImageCandidates = (card) => {
    const candidates = [];
    card.querySelectorAll('img').forEach((img) => {
      const source = getBestImageSource(img);
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

  const EXPAND_LABELS = [
    'see more',
    'show more',
    'see translation',
    'continue reading',
    'see summary details',
    'see ad details'
  ];
  const EXPAND_SELECTORS = ['[data-ad-preview="see_more_link"]', '[role="button"]', 'button'];

  const expandCollapsibleSections = (card) => {
    let expanded = false;
    const nodes = Array.from(card.querySelectorAll(EXPAND_SELECTORS.join(', ')));
    nodes.forEach((node) => {
      const label = (node.innerText || node.getAttribute('aria-label') || '').trim().toLowerCase();
      if (!label) return;
      if (node.getAttribute('aria-expanded') === 'true') return;
      if (EXPAND_LABELS.some((value) => label === value || label.startsWith(`${value} `))) {
        node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        expanded = true;
      }
    });
    return expanded;
  };

  const getCardText = (card) => {
    const clone = card.cloneNode(true);
    clone.querySelectorAll('.swipekit-save-btn-wrapper').forEach((node) => node.remove());
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.left = '-9999px';
    div.style.top = '-9999px';
    div.style.whiteSpace = 'pre-wrap';
    div.appendChild(clone);
    document.body.appendChild(div);
    const text = div.innerText || '';
    document.body.removeChild(div);
    return text.replace(/\u200b/g, '').replace(/\r\n/g, '\n');
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

  const stripBrandPrefix = (line, brandName) => {
    if (!brandName) return line;
    const safe = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sponsoredPattern = new RegExp(`^${safe}\\s*Sponsored\\s*`, 'i');
    if (sponsoredPattern.test(line)) return line.replace(sponsoredPattern, '');
    const brandPattern = new RegExp(`^${safe}\\b`, 'i');
    if (brandPattern.test(line)) return line.replace(brandPattern, '');
    return line;
  };

  const splitSegmentsByPattern = (segment, regex) => {
    const fragments = [];
    let remaining = segment;
    while (remaining) {
      const match = remaining.match(regex);
      if (!match || typeof match.index !== 'number') {
        fragments.push(remaining);
        break;
      }
      const before = remaining.slice(0, match.index);
      const after = remaining.slice(match.index + match[0].length);
      if (before) fragments.push(before);
      fragments.push(match[0]);
      remaining = after;
    }
    return fragments.length ? fragments : [''];
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

  const shouldDropPrefix = (value) => /(activelibrary id|see ad details|open dropdown|summary details|total active time|platforms?)/i.test(value);

  const removeMetadataPrefix = (line) => {
    const lower = line.toLowerCase();
    const idx = lower.lastIndexOf('sponsored');
    if (idx > -1) {
      const prefix = lower.slice(0, idx);
      if (shouldDropPrefix(prefix)) {
        return line.slice(idx + 'sponsored'.length);
      }
    }
    return line;
  };

  const normalizeForDetection = (value) => value.replace(/\u200b/g, '').replace(TIMESTAMP_PATTERN, '').trim();

  const cleanSegments = (text, brandName = '') => {
    if (!text) return [];
    const normalized = text.replace(/\r\n/g, '\n').replace(/\u200b/g, '');
    const segments = [];
    normalized.split('\n').forEach((line) => {
      const withoutBrand = stripBrandPrefix(line, brandName);
      const cleanedLine = removeMetadataPrefix(withoutBrand);
      const wasOriginalBlank = !line.trim();
      if (!cleanedLine) {
        if (wasOriginalBlank) {
          segments.push({ raw: '', detection: '', lower: '', isBlank: true });
        }
        return;
      }
      splitLineSegments(cleanedLine).forEach((segment) => {
        if (segment === '') {
          segments.push({ raw: '', detection: '', lower: '', isBlank: true });
          return;
        }
        const detection = normalizeForDetection(segment);
        if (!detection) {
          segments.push({ raw: segment, detection: '', lower: '', isBlank: true });
          return;
        }
        if (AD_COPY_NOISE.some((pattern) => pattern.test(detection))) return;
        segments.push({
          raw: segment,
          detection,
          lower: detection.toLowerCase(),
          isBlank: false
        });
      });
    });
    return segments;
  };

  const removeTruncatedPreviews = (segments) =>
    segments.filter((segment, index) => {
      if (!segment.detection) return true;
      if (!ELLIPSIS_LINE_PATTERN.test(segment.detection)) return true;
      const base = segment.detection.replace(ELLIPSIS_LINE_PATTERN, '').trim();
      if (!base) return false;
      for (let i = index + 1; i < segments.length; i += 1) {
        const next = segments[i];
        if (!next.detection) continue;
        if (next.detection.toLowerCase().startsWith(base.toLowerCase())) {
          return false;
        }
      }
      return true;
    });

  const categorizeSegments = (segments) => {
    const primary = [];
    const descriptionParts = [];
    let domain = '';
    let headline = '';
    let ctaLabel = '';
    segments.forEach(({ raw, detection, lower, isBlank }) => {
      if (isBlank && raw === '') {
        primary.push('');
        return;
      }
      if (!detection) return;
      if (!ctaLabel && CTA_LABEL_SET.has(lower)) {
        ctaLabel = detection;
        return;
      }
      const domainCandidate = detection.replace(/^https?:\/\//i, '');
      if (!domain && DOMAIN_ONLY_PATTERN.test(domainCandidate)) {
        domain = detection;
        return;
      }
      if (domain && !headline) {
        headline = detection;
        return;
      }
      if (domain && headline) {
        descriptionParts.push(detection);
        return;
      }
      primary.push(raw);
    });
    return {
      primaryText: primary.join('\n'),
      domain,
      headline,
      description: descriptionParts.join('\n').trim(),
      ctaLabel
    };
  };

  const extractTextSegments = (card, brandName) => {
    const rawText = getCardText(card);
    const segments = removeTruncatedPreviews(cleanSegments(rawText, brandName));
    const result = categorizeSegments(segments);
    if (!result.primaryText && rawText.trim()) {
      result.primaryText = rawText;
    }
    const fullAdCopy = segments
      .map(({ raw, isBlank }) => (isBlank ? '' : raw))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { rawText, fullAdCopy, ...result };
  };

  const captureCard = (card) => {
    const { brandName, brandLogo } = collectBrandInfo(card);
    const { rawText, fullAdCopy, primaryText, domain, headline, description, ctaLabel } = extractTextSegments(card, brandName);
    const hasPrimary = typeof primaryText === 'string' && primaryText.replace(/\s/g, '').length > 0;
    const finalAdCopy = fullAdCopy || (hasPrimary ? primaryText : rawText);
    const aspectRatio = detectAspectRatio(card);
    const payload = {
      id: createId(),
      platform: detectPlatform(),
      capturedAt: new Date().toISOString(),
      pageUrl: window.location.href,
      text: finalAdCopy,
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
    payload.extra.adCopy = finalAdCopy;
    payload.extra.fullAdCopy = finalAdCopy;
    payload.extra.domain = domain || '';
    payload.extra.headline = headline || '';
    payload.extra.linkDescription = description || '';
    payload.extra.ctaLabel = ctaLabel || '';
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

  const expandAdCopy = async (card) => {
    let attempts = 0;
    let expanded = false;
    while (attempts < 3) {
      const didExpand = expandCollapsibleSections(card);
      expanded = expanded || didExpand;
      if (!didExpand) break;
      attempts += 1;
      try {
        await new Promise((resolve) => setTimeout(resolve, 120));
      } catch (error) {
        console.warn('Swipekit: Expansion wait failed', error);
        break;
      }
    }
    return expanded;
  };

  const handleSave = async (card, button) => {
    if (!chrome.runtime?.id) {
      showToast('Extension updated. Please refresh page.', true);
      return;
    }

    button.disabled = true;
    const original = button.dataset.defaultLabel || 'Save';
    updateButtonLabel(button, 'Saving...');

    try {
      await expandAdCopy(card);
    } catch (e) {
      console.warn('Swipekit: Expansion error', e);
    }

    // Small delay to ensure DOM has updated after expansion
    await new Promise(resolve => requestAnimationFrame(resolve));

    const payload = captureCard(card);
    const hasCopy = typeof payload.text === 'string' && payload.text.replace(/\s/g, '').length > 0;
    if (!hasCopy && !payload.imageUrls.length && !payload.videoUrls.length) {
      updateButtonLabel(button, original);
      button.disabled = false;
      showToast('Swipekit: nothing to capture', true);
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: 'SAVE_AD_ITEM', item: payload }, (response) => {
        button.disabled = false;
        if (chrome.runtime.lastError || !response?.ok) {
          const errorMessage = response?.error || chrome.runtime.lastError?.message || 'Swipekit save failed';
          updateButtonLabel(button, original);
          showToast(errorMessage, true);
          return;
        }
        updateButtonLabel(button, 'Saved');
        showToast('Saved to Swipe');
        setTimeout(() => updateButtonLabel(button, original), 1500);
      });
    } catch (e) {
      button.disabled = false;
      updateButtonLabel(button, original);
      if (e.message.includes('Extension context invalidated')) {
        showToast('Please refresh the page', true);
      } else {
        showToast('Swipekit save failed', true);
      }
    }
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

  const getMountRoot = () => {
    const platform = detectPlatform();
    if (platform === 'instagram') return document.querySelector('main') || document.body;
    if (platform === 'facebook-ad-library') return document.querySelector('[role="main"]') || document.body;
    if (platform === 'facebook-feed') return document.querySelector('[role="feed"]') || document.body;
    return document.body;
  };

  const init = () => {
    injectStyles();
    scan();

    const setupObserver = (attempts = 5) => {
      const target = getMountRoot();
      if (!target) {
        if (attempts > 0) setTimeout(() => setupObserver(attempts - 1), 600);
        return;
      }

      const observer = new MutationObserver((mutations) => {
        if (mutations.some((mutation) => mutation.addedNodes.length)) {
          scan();
        }
      });
      observer.observe(target, { childList: true, subtree: true });
    };

    setupObserver();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

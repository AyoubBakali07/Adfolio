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
    let brandElement = null;
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
          brandElement = node;
          break;
        }
      }
    }
    if (!brandName) {
      const fallback = card.querySelector('strong, h3, h4, [role="heading"]');
      if (fallback) {
        brandName = sanitize(fallback.textContent || '').split('•')[0].trim();
        brandElement = fallback;
      }
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

    return { brandName, brandLogo, brandElement };
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
      description: descriptionParts.join(' ').trim(),
      ctaLabel
    };
  };

  const getMainMediaElement = (card) => {
    const videos = Array.from(card.querySelectorAll('video'));
    const visibleVideo = videos.find((v) => v.offsetWidth > 0 && v.offsetHeight > 0);
    if (visibleVideo) return visibleVideo;
    const images = Array.from(card.querySelectorAll('img'));
    const sorted = images
      .map((img) => ({ img, area: img.offsetWidth * img.offsetHeight }))
      .sort((a, b) => b.area - a.area);
    if (sorted.length > 0 && sorted[0].area > 10000) return sorted[0].img;
    return null;
  };

  const getTextFromRange = (root, startNode, endNode) => {
    const range = document.createRange();
    if (startNode) range.setStartAfter(startNode);
    else range.setStart(root, 0);
    if (endNode) range.setEndBefore(endNode);
    else range.setEndAfter(root.lastChild || root);
    const fragment = range.cloneContents();
    const div = document.createElement('div');
    div.appendChild(fragment);
    div.querySelectorAll('.swipekit-save-btn-wrapper').forEach((node) => node.remove());
    return div.innerText || '';
  };

  const cleanBodyText = (text, brandName) => {
    if (!text) return '';
    const cleaned = text.replace(/\u200b/g, '').replace(/\r\n/g, '\n');
    const lines = cleaned.split('\n');
    const filteredLines = [];
    let passedHeader = false;
    for (let i = 0; i < lines.length; i += 1) {
      let line = lines[i].trim();
      if (!line) {
        if (passedHeader) filteredLines.push('');
        continue;
      }
      if (shouldDropPrefix(line) || AD_COPY_NOISE.some((p) => p.test(line))) continue;
      if (!passedHeader) {
        if (line.toLowerCase() === 'sponsored' || (brandName && line.toLowerCase().includes(brandName.toLowerCase()))) {
          line = stripBrandPrefix(line, brandName);
          line = removeMetadataPrefix(line);
          if (!line.trim()) continue;
        }
        passedHeader = true;
      }
      filteredLines.push(line);
    }
    return filteredLines.join('\n').trim();
  };

  const extractTextSegments = (card, brandName, brandElement) => {
    const rawText = getCardText(card);
    let primaryText = '';
    let footerResult = {};

    const mediaElement = getMainMediaElement(card);
    if (brandElement && mediaElement) {
      const bodyRaw = getTextFromRange(card, brandElement, mediaElement);
      primaryText = cleanBodyText(bodyRaw, brandName);

      const footerRaw = getTextFromRange(card, mediaElement, null);
      const footerSegments = removeTruncatedPreviews(cleanSegments(footerRaw, brandName));
      footerResult = categorizeSegments(footerSegments);
    } else {
      const segments = removeTruncatedPreviews(cleanSegments(rawText, brandName));
      footerResult = categorizeSegments(segments);
      primaryText = footerResult.primaryText;
    }

    if (!primaryText && rawText.trim()) {
      primaryText = rawText.trim();
    }

    return {
      rawText,
      primaryText,
      domain: footerResult.domain || '',
      headline: footerResult.headline || '',
      description: footerResult.description || '',
      ctaLabel: footerResult.ctaLabel || ''
    };
  };

  const captureCard = (card) => {
    const { brandName, brandLogo, brandElement } = collectBrandInfo(card);
    const { rawText, primaryText, domain, headline, description, ctaLabel } = extractTextSegments(card, brandName, brandElement);
    const aspectRatio = detectAspectRatio(card);
    const payload = {
      id: createId(),
      platform: detectPlatform(),
      capturedAt: new Date().toISOString(),
      pageUrl: window.location.href,
      text: primaryText,
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
    payload.extra.adCopy = primaryText;
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

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
      .swipekit-save-btn-wrapper.swipekit-overlay {
        position: absolute !important;
        top: 20px !important;
        right: 20px !important;
        width: auto !important;
        margin: 0 !important;
        z-index: 999999999 !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        transform: translate3d(0, 0, 0) !important;
        will-change: transform !important;
      }
      .swipekit-save-btn-clean.swipekit-overlay-btn {
        position: relative !important;
        z-index: 999999999 !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        transform: translate3d(0, 0, 0) !important;
        background: rgba(248, 247, 244, 0.95) !important;
        backdrop-filter: blur(4px) !important;
        border: 2px solid rgba(15, 23, 42, 0.3) !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
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

  const normalizeValue = (value = '') => value.replace(/\s+/g, ' ').trim().toLowerCase();

  let parserWarningShown = false;

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
    const images = card.querySelectorAll('img');

    images.forEach((img, index) => {
      const source = getBestImageSource(img);
      if (!source) return;
      const rect = img.getBoundingClientRect();
      const width = Math.round(rect.width || img.naturalWidth || img.width || 0);
      const height = Math.round(rect.height || img.naturalHeight || img.height || 0);
      candidates.push({ source, width, height, area: width * height, index });
    });

    if (!candidates.length) return [];

    const MIN_DIMENSION = 140;
    const filtered = candidates.filter(({ width, height, area }) => {
      if (!width || !height) return false;
      if (width >= MIN_DIMENSION || height >= MIN_DIMENSION) return true;
      return area >= MIN_DIMENSION * MIN_DIMENSION;
    });

    const ordered = (filtered.length ? filtered : candidates).sort((a, b) => a.index - b.index);
    return ordered;
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
    let brandLogo = null;

    // First, find all small square images that could be brand logos
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

    // Sort potential logos by size (prefer medium-sized logos)
    potentialLogos.sort((a, b) => {
      const aScore = Math.abs(a.width - a.height) + (a.width < 20 ? 1000 : a.width > 120 ? 100 : 0);
      const bScore = Math.abs(b.width - b.height) + (b.width < 20 ? 1000 : b.width > 120 ? 100 : 0);
      return aScore - bScore;
    });

    // Modal specific: The logo is often the first image in the dialog header
    const isModal = card.getAttribute('role') === 'dialog';
    if (isModal && !brandLogo) {
      const headerLogo = potentialLogos.find(p => p.width >= 30 && p.width <= 100 && Math.abs(p.width - p.height) < 5);
      if (headerLogo) {
        brandLogo = headerLogo.source;
      }
    }

    const extractLabel = (node) => {
      if (!node) return '';
      const text = sanitize(node.textContent || '')
        .split('•')[0]
        .split('Sponsored')[0]
        .trim();
      if (!text) return '';
      if (text.toLowerCase() === 'sponsored') return '';
      if (text.length < 2 || text.length > 60) return '';
      return text;
    };

    const findBrandNearSponsored = () => {
      const sponsoredNode = Array.from(card.querySelectorAll('span, div, strong'))
        .find((node) => normalizeValue(node.textContent) === 'sponsored');
      if (!sponsoredNode) return '';

      const candidateTexts = [];
      let prev = sponsoredNode.previousElementSibling;
      while (prev && !extractLabel(prev)) {
        prev = prev.previousElementSibling;
      }
      if (prev) candidateTexts.push(extractLabel(prev));

      if (sponsoredNode.parentElement) {
        Array.from(sponsoredNode.parentElement.children)
          .filter((child) => child !== sponsoredNode)
          .forEach((child) => candidateTexts.push(extractLabel(child)));
      }

      return candidateTexts.find(Boolean) || '';
    };

    // Focus on header region to avoid scanning the full card
    const headerContainer = (() => {
      const sponsored = Array.from(card.querySelectorAll('span, div, strong'))
        .find((node) => normalizeValue(node.textContent) === 'sponsored');
      if (sponsored?.parentElement) return sponsored.parentElement;
      const heading = card.querySelector('div[role="heading"], h2, h3, h4, strong');
      return heading ? heading.parentElement : null;
    })();

    const headerLogos = headerContainer
      ? potentialLogos.filter(({ img }) => headerContainer.contains(img))
      : potentialLogos;

    const limitedLogos = headerLogos.slice(0, 6);

    // Try the structured header first (above "Sponsored")
    if (!brandName) {
      brandName = findBrandNearSponsored();
    }

    // Try to find brand name by looking near a limited set of header logos
    if (!brandName) {
      for (const logoCandidate of limitedLogos) {
        if (brandLogo) break; // Already found a logo

        const img = logoCandidate.img;
        const parent = img.parentElement;
        const grandParent = parent?.parentElement;

        const nearbyContainers = [
          parent,
          grandParent,
          parent?.nextElementSibling,
          parent?.previousElementSibling,
          grandParent?.nextElementSibling,
          grandParent?.previousElementSibling
        ].filter(Boolean);

        for (const container of nearbyContainers) {
          const cleanText = extractLabel(container);
          if (cleanText) {
            brandName = cleanText;
            brandLogo = logoCandidate.source;
            break;
          }
        }
        if (brandName) break;
      }
    }

    // If no brand found near logos or sponsored label, try general brand detection
    if (!brandName) {
      // In Ad Library cards, the brand usually sits in the first heading block under the media and above "Sponsored".
      const brandHeading = card.querySelector('div[role="heading"], h2, h3, h4, strong');
      if (brandHeading) {
        const headingText = sanitize(brandHeading.textContent || '').split('•')[0].split('Sponsored')[0].trim();
        if (headingText && headingText !== 'Sponsored') {
          brandName = headingText;
        }
      }

      // Try siblings around the "Sponsored" label (common Ad Library layout)
      if (!brandName) {
        const sponsoredNode = Array.from(card.querySelectorAll('span, div, strong'))
          .find((node) => normalizeValue(node.textContent) === 'sponsored');
        if (sponsoredNode) {
          const candidateTexts = [];
          if (sponsoredNode.previousElementSibling) {
            candidateTexts.push(sponsoredNode.previousElementSibling.textContent || '');
          }
          if (sponsoredNode.parentElement) {
            Array.from(sponsoredNode.parentElement.children)
              .filter((child) => child !== sponsoredNode)
              .forEach((child) => candidateTexts.push(child.textContent || ''));
          }
          const firstName = candidateTexts
            .map((txt) => sanitize(txt).split('•')[0].split('Sponsored')[0].trim())
            .find((txt) => txt && txt.toLowerCase() !== 'sponsored');
          if (firstName) brandName = firstName;
        }
      }

      // Fallback selectors for other layouts
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
      if (!brandName) {
        for (const selector of nameSelectors) {
          const node = card.querySelector(selector);
          if (node) {
            const text = sanitize(node.textContent || '');
            if (text && text !== 'Sponsored') {
              brandName = text.split('•')[0].split('Sponsored')[0].trim();
              break;
            }
          }
        }
      }

      if (!brandName) {
        const fallback = card.querySelector('strong, h2, h3, h4, [role="heading"]');
        if (fallback) {
          const fallbackText = sanitize(fallback.textContent || '');
          if (fallbackText && fallbackText !== 'Sponsored') {
            brandName = fallbackText.split('•')[0].split('Sponsored')[0].trim();
          }
        }
      }
    }

    // If still no logo but have brand name, try to find the best logo candidate
    if (!brandLogo && brandName && potentialLogos.length > 0) {
      const logoMatch = potentialLogos.find(({ width, height, alt }) => {
        if (!width || !height) return false;
        const approxSquare = Math.abs(width - height) <= Math.min(width, height) * 0.4;
        if (alt.includes('profile') || alt.includes('logo')) return true;
        return approxSquare && width >= 20 && width <= 120 && height >= 20 && height <= 120;
      });
      if (logoMatch) {
        brandLogo = logoMatch.source;
      }
    }

    // Clean up "Name's Post"
    if (brandName) {
      // Remove "Name's Post" suffix case-insensitive
      brandName = brandName.replace(/['’]s Post$/i, '').trim();
      // Also split by it in case of extra text
      const split = brandName.split(/['’]s Post/i);
      if (split.length > 0) {
        brandName = split[0].trim();
      }
    }

    if (brandName && brandName.trim().toLowerCase() === 'sponsored') {
      brandName = '';
    }

    return { brandName, brandLogo };
  };

  const isDurableMediaUrl = (url) => {
    if (!url) return false;
    const normalized = url.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith('blob:')) return false;
    if (normalized.startsWith('data:')) return false;
    return true;
  };

  const getVideoCandidates = (card) => {
    const candidates = [];
    // In modal, sometimes video is in a shadow root or iframe, but usually it's a <video> tag.
    // We should also look for the main video if the card is the modal itself.
    const videos = Array.from(card.querySelectorAll('video'));

    // If no videos found in card (modal), try looking at the whole document if we are in modal mode
    // and the card is the dialog. But be careful not to grab unrelated videos.
    // Actually, the modal usually contains the video.

    videos.forEach((video) => {
      const rect = video.getBoundingClientRect();
      const width = Math.round(video.videoWidth || rect.width || video.clientWidth || 0);
      const height = Math.round(video.videoHeight || rect.height || video.clientHeight || 0);
      const area = width && height ? width * height : 0;
      const urls = new Set();
      [video.currentSrc, video.src].forEach((value) => {
        const normalized = normalizeUrl(value);
        if (isDurableMediaUrl(normalized)) urls.add(normalized);
      });
      video.querySelectorAll('source').forEach((source) => {
        const normalized = normalizeUrl(source.src);
        if (isDurableMediaUrl(normalized)) urls.add(normalized);
      });
      if (urls.size) candidates.push({ urls: Array.from(urls), width, height, area });
    });

    // If no video found in card, and it's a modal, try to find the main video in the document that overlaps with the card
    // or is within the central area. 
    if (candidates.length === 0 && card.getAttribute('role') === 'dialog') {
      // Sometimes the video is not a descendant of the dialog role element in the DOM tree (portals etc)
      // But usually it is. Let's check for iframes or other video containers.
      const iframes = card.querySelectorAll('iframe');
      // We can't access iframe content usually, but maybe the src is there.
    }

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

  const DOMAIN_ONLY_PATTERN = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;
  const CTA_LABELS = [
    'shop now',
    'learn more',
    'sign up',
    'subscribe',
    'order now',
    'get offer',
    'contact us',
    'apply now',
    'download',
    'watch more',
    'book now',
    'get quote',
    'see menu',
    'donate now',
    'view details'
  ];
  const CTA_LABEL_SET = new Set(CTA_LABELS);

  const getPrimaryMediaElement = (card) => {
    const MIN_DIMENSION = 140;
    const candidates = [];

    const addCandidate = (el) => {
      const rect = el.getBoundingClientRect();
      const width = Math.round(rect.width || el.videoWidth || el.naturalWidth || 0);
      const height = Math.round(rect.height || el.videoHeight || el.naturalHeight || 0);
      if (!width || !height) return;
      if (Math.max(width, height) < MIN_DIMENSION && width * height < MIN_DIMENSION * MIN_DIMENSION) return;
      candidates.push({ el, area: width * height });
    };

    card.querySelectorAll('video').forEach(addCandidate);
    card.querySelectorAll('img').forEach(addCandidate);

    if (!candidates.length) return null;
    return candidates.sort((a, b) => b.area - a.area)[0].el;
  };

  const getVisibleTextBlocks = (card) => {
    const nodes = Array.from(card.querySelectorAll('p, span, div, strong, b, h1, h2, h3, h4, h5, h6, a'));
    return nodes
      .map((el) => {
        const text = sanitize(el.textContent || '');
        if (!text) return null;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return null;
        return { el, text, rect };
      })
      .filter(Boolean);
  };

  const collectAdLibraryTextSegments = (card) => {
    const sponsoredNode = Array.from(card.querySelectorAll('span, div, strong')).find((node) => normalizeValue(node.textContent) === 'sponsored');
    const sponsoredBottom = sponsoredNode ? sponsoredNode.getBoundingClientRect().bottom : null;

    const mediaEl = getPrimaryMediaElement(card);
    if (!mediaEl) return null;
    const mediaRect = mediaEl.getBoundingClientRect();
    const mediaTop = mediaRect.top;
    const mediaBottom = mediaRect.bottom;

    const blocks = getVisibleTextBlocks(card);
    if (!blocks.length) return null;

    const dedupeByText = (list) => {
      const seen = new Set();
      return list.filter(({ text }) => {
        const key = normalizeValue(text);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const isInsideHeader = (el) => {
      if (!sponsoredNode) return false;
      return sponsoredNode.closest('div, header')?.contains(el);
    };

    const primaryBlocks = blocks.filter(({ rect, el }) => {
      if (sponsoredBottom !== null && rect.top < sponsoredBottom - 4) return false;
      if (rect.bottom > mediaTop + 2) return false;
      if (isInsideHeader(el)) return false;
      if (normalizeValue(el.textContent) === 'sponsored') return false;
      return true;
    });

    const primaryText = dedupeByText(primaryBlocks)
      .map(({ text }) => text)
      .join('\n')
      .trim();

    const postMediaBlocks = blocks.filter(({ rect }) => rect.top >= mediaBottom - 2);

    const domainBlock = postMediaBlocks.find(({ text }) => DOMAIN_ONLY_PATTERN.test(text.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')));
    const domain = domainBlock ? domainBlock.text : '';

    const afterDomain = domainBlock ? postMediaBlocks.slice(postMediaBlocks.indexOf(domainBlock) + 1) : postMediaBlocks;
    const isHeadlineCandidate = ({ el, text }) => {
      if (!text || text.length < 3 || text.length > 160) return false;
      const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag) || tag === 'strong' || tag === 'b') return true;
      return !text.includes('\n') && text.length < 120;
    };
    const headlineBlock = afterDomain.find(isHeadlineCandidate);
    const headline = headlineBlock ? headlineBlock.text : '';

    const descriptionBlock = (() => {
      if (!headlineBlock) return null;
      const startIndex = afterDomain.indexOf(headlineBlock);
      return afterDomain.slice(startIndex + 1).find(({ text }) => text.length > 0 && text !== domain && text !== headline);
    })();
    const description = descriptionBlock ? descriptionBlock.text : '';

    const normalizedDomain = normalizeValue(domain);
    const duplicateGuard = new Set(
      [primaryText, headline, description, domain].map((v) => normalizeValue(v)).filter(Boolean)
    );

    const ctaCandidates = Array.from(card.querySelectorAll('button, [role="button"]'))
      .map((btn) => {
        const rect = btn.getBoundingClientRect();
        const text = sanitize(btn.textContent || '');
        return { btn, rect, text, normalized: normalizeValue(text) };
      })
      .filter(({ rect, text, normalized }) => {
        if (!text || text.length > 40) return false;
        if (rect.top < mediaBottom - 4) return false;
        if (DOMAIN_ONLY_PATTERN.test(normalized.replace(/^https?:\/\//, '').replace(/^www\./, ''))) return false;
        if (normalized.includes('.')) return false; // avoid domains in CTA
        if (duplicateGuard.has(normalized)) return false;
        return true;
      });

    const pickCta = () => {
      if (!ctaCandidates.length) return '';
      const sorted = ctaCandidates.sort((a, b) => {
        const aKnown = CTA_LABEL_SET.has(a.normalized);
        const bKnown = CTA_LABEL_SET.has(b.normalized);
        if (aKnown && !bKnown) return -1;
        if (!aKnown && bKnown) return 1;
        return a.text.length - b.text.length;
      });
      return sorted[0].text;
    };

    const ctaLabel = pickCta();

    const rawText = getCardText(card);
    const fullAdCopy = primaryText || rawText;

    if (!primaryText && !headline && !description && !domain && !ctaLabel) return null;

    return {
      rawText,
      fullAdCopy,
      primaryText: primaryText || fullAdCopy || rawText,
      domain,
      headline,
      description,
      ctaLabel
    };
  };

  const EXPAND_LABELS = [
    'see more',
    'show more',
    'see translation',
    'continue reading',
    'see summary details'
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

  const removeComments = (node) => {
    // Find the action bar containing Like/Comment/Share
    const buttons = Array.from(node.querySelectorAll('div[role="button"], button, span'));
    const actionButton = buttons.find(b => {
      const t = b.textContent.toLowerCase().trim();
      return t === 'like' || t === 'comment' || t === 'share';
    });

    if (actionButton) {
      // Traverse up to find the row/group containing these buttons
      let parent = actionButton.parentElement;
      let depth = 0;
      while (parent && parent !== node && depth < 5) {
        // If we find a group or a container with multiple such buttons, that's likely the bar
        const hasSiblings = parent.querySelectorAll('div[role="button"], button').length > 1;
        const isGroup = parent.getAttribute('role') === 'group';

        if (isGroup || hasSiblings) {
          // This is the action bar. Remove it and everything after it (comments).
          let current = parent;
          // Remove all following siblings of the action bar
          while (current.nextElementSibling) {
            current.nextElementSibling.remove();
          }
          // Remove the action bar itself
          parent.remove();
          return;
        }
        parent = parent.parentElement;
        depth++;
      }
    }

    // Fallback: Remove forms (comment inputs) and lists (comments)
    node.querySelectorAll('form').forEach(n => n.remove());
    node.querySelectorAll('ul').forEach(n => {
      if (n.textContent.toLowerCase().includes('reply')) n.remove();
    });
  };

  const getCardText = (card) => {
    const clone = card.cloneNode(true);
    clone.querySelectorAll('.swipekit-save-btn-wrapper').forEach((node) => node.remove());

    // Remove comments and engagement bar to isolate primary text
    removeComments(clone);

    const container = document.createElement('div');
    container.style.whiteSpace = 'pre-wrap';
    container.appendChild(clone);

    const text = container.innerText || container.textContent || '';
    return text.replace(/\u200b/g, '').replace(/\r\n/g, '\n');
  };

  const extractTextSegments = (card, brandName) => {
    const platform = detectPlatform();

    if (platform === 'facebook-ad-library') {
      const structured = collectAdLibraryTextSegments(card);
      if (structured) return structured;
    }

    const rawText = getCardText(card);
    const parser = (typeof window !== 'undefined' && window.SwipekitText && window.SwipekitText.parseAdText) || null;
    if (parser) {
      return parser(rawText, brandName);
    }
    if (!parserWarningShown) {
      parserWarningShown = true;
      console.warn('Swipekit: text parser missing; ad copy/link parsing may be degraded');
    }
    return {
      rawText,
      fullAdCopy: rawText,
      primaryText: rawText,
      domain: '',
      headline: '',
      description: '',
      ctaLabel: ''
    };
  };

  const captureCard = (card) => {
    const platform = detectPlatform();
    const isAdLibrary = platform === 'facebook-ad-library';

    // Keep the scraped brand info handy so we don't recompute it or lose it in transit
    const brandInfo = isAdLibrary ? collectBrandInfo(card) : { brandName: '', brandLogo: null };
    const scrapedBrandName = brandInfo.brandName || '';
    const scrapedBrandLogo = brandInfo.brandLogo || null;

    // Only use the structured Ad Library scraping on Ad Library pages; elsewhere fall back to plain text capture
    const textSegments = isAdLibrary
      ? extractTextSegments(card, scrapedBrandName)
      : (() => {
          const fallbackText = getCardText(card);
          return {
            rawText: fallbackText,
            fullAdCopy: fallbackText,
            primaryText: fallbackText,
            domain: '',
            headline: '',
            description: '',
            ctaLabel: ''
          };
        })();

    const { rawText, fullAdCopy, primaryText, domain, headline, description, ctaLabel } = textSegments;

    // Debug logging
    console.log('Swipekit: Card capture debug', {
      brandName: scrapedBrandName,
      brandLogo: scrapedBrandLogo,
      primaryText: primaryText?.substring(0, 100),
      fullAdCopy: fullAdCopy?.substring(0, 100),
      rawText: rawText?.substring(0, 100),
      domain,
      headline,
      description,
      ctaLabel
    });

    const hasPrimary = typeof primaryText === 'string' && primaryText.replace(/\s/g, '').length > 0;
    const aspectRatio = detectAspectRatio(card);

    // Structure the data to match Ad Library format
    const payload = {
      id: createId(),
      platform,
      capturedAt: new Date().toISOString(),
      pageUrl: window.location.href,
      text: primaryText || fullAdCopy || rawText, // Main ad copy
      imageUrls: collectImages(card),
      videoUrls: collectVideos(card),
      brandName: scrapedBrandName,
      brandLogo: scrapedBrandLogo,
      extra: {
        rawText: rawText,
        adCopy: primaryText || fullAdCopy || rawText,
        fullAdCopy: fullAdCopy || rawText,
        primaryText: primaryText || '',
        domain: domain || '',
        headline: headline || '',
        linkDescription: description || '',
        ctaLabel: ctaLabel || '',
        aspectRatio: Number.isFinite(aspectRatio) ? aspectRatio : null
      }
    };

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

    const restoreButtonState = () => {
      button.disabled = false;
      updateButtonLabel(button, original);
    };

    try {
      try {
        await expandAdCopy(card);
      } catch (e) {
        console.warn('Swipekit: Expansion error', e);
      }

      // Small delay to ensure DOM has updated after expansion
      await new Promise(resolve => requestAnimationFrame(resolve));

      let payload;
      let degradedCapture = false;
      try {
        payload = captureCard(card);
      } catch (error) {
        console.error('Swipekit: capture failed, saving minimal payload', error);
        degradedCapture = true;
        payload = {
          id: createId(),
          platform: detectPlatform(),
          capturedAt: new Date().toISOString(),
          pageUrl: window.location.href,
          text: '',
          imageUrls: [],
          videoUrls: [],
          brandName: '',
          brandLogo: null,
          extra: {
            rawText: '',
            adCopy: '',
            fullAdCopy: '',
            primaryText: '',
            domain: '',
            headline: '',
            linkDescription: '',
            ctaLabel: '',
            aspectRatio: null,
            degradedCapture: true,
            captureError: error?.message || 'Unknown capture error'
          }
        };
      }

      const hasCopy = typeof payload.text === 'string' && payload.text.replace(/\s/g, '').length > 0;
      if (!hasCopy && !payload.imageUrls.length && !payload.videoUrls.length && !degradedCapture) {
        restoreButtonState();
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
          showToast(degradedCapture ? 'Saved (limited data)' : 'Saved to Swipe');
          setTimeout(() => updateButtonLabel(button, original), 1500);
        });
      } catch (e) {
        restoreButtonState();
        if (e.message.includes('Extension context invalidated')) {
          showToast('Please refresh the page', true);
        } else {
          showToast('Swipekit save failed', true);
        }
      }
    } catch (error) {
      console.error('Swipekit: unexpected save error', error);
      restoreButtonState();
      showToast('Swipekit: save failed', true);
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
      console.log('Swipekit: Button clicked!', event);
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

    const isModal = card.getAttribute('role') === 'dialog';
    const button = createSaveButton(card);
    const wrapper = document.createElement('div');
    wrapper.className = 'swipekit-save-btn-wrapper';

    if (isModal) {
      wrapper.classList.add('swipekit-overlay');
      button.classList.add('swipekit-overlay-btn');
      wrapper.appendChild(button);

      console.log('Swipekit: Creating modal button', { button: button.outerHTML, wrapper: wrapper.outerHTML });

      // For modals, attach directly to the modal/dialog element itself
      // This ensures we're above all video content and controls
      let target = card;

      // Make sure the target has position relative for absolute positioning
      const targetStyle = window.getComputedStyle(target);
      if (targetStyle.position === 'static') {
        target.style.position = 'relative';
      }

      // Append to the modal itself, not to media containers
      target.appendChild(wrapper);

      console.log('Swipekit: Button attached to modal', {
        modal: card.tagName,
        buttonPosition: window.getComputedStyle(wrapper).position,
        buttonZIndex: window.getComputedStyle(wrapper).zIndex
      });
    } else {
      wrapper.appendChild(button);
      const anchor = findAnchor(card);
      if (anchor && anchor.parentElement) {
        anchor.parentElement.insertBefore(wrapper, anchor.nextSibling);
      } else {
        card.appendChild(wrapper);
      }
    }

    card.setAttribute(CARD_ATTR, 'true');
  };

  const getCardCandidates = () => {
    const platform = detectPlatform();
    if (platform === 'facebook-ad-library') {
      return Array.from(document.querySelectorAll('div.x1plvlek, div[role="article"], div[data-pagelet^="FeedUnit"]'))
        .filter((node) => node.offsetParent && matchesAdLibraryCard(node));
    }

    if (platform === 'facebook-feed') {
      // Prioritize media modals
      const modals = Array.from(document.querySelectorAll('div[role="dialog"]'));
      const mediaModals = modals.filter(modal => {
        // Check if it looks like a media viewer (has video or large image)
        return modal.querySelector('video') || modal.querySelector('img[src*="scontent"]');
      });

      if (mediaModals.length > 0) {
        return mediaModals;
      }

      // Return empty to disable feed injection as per "only when i click" request
      return [];
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

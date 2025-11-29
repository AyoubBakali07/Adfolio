(function (global) {
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
    /^this ad has multiple versions$/i,
    /^see translation/i,
    /^sponsored$/i,
    /^facebook ad library/i,
    /^ad library\b/i,
    /^landing page\b/i,
    /^saved \d+/i,
    /^show more$/i,
    /^show less$/i,
    /^facebook$/i,
    /^like$/i,
    /^comment$/i,
    /^share$/i,
    /^\d+ comments$/i,
    /^\d+ shares$/i,
    /^\d+ likes$/i,
    /^write a comment/i,
    /^press enter to post/i
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

  const normalizeValue = (value = '') => value.replace(/\s+/g, ' ').trim().toLowerCase();

  const stripBrandPrefix = (line, brandName) => {
    if (!brandName) return line;
    const safe = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sponsoredPattern = new RegExp(`^${safe}\\s*Sponsored\\s*`, 'i');
    if (sponsoredPattern.test(line)) return line.replace(sponsoredPattern, '');
    const brandPattern = new RegExp(`^${safe}\\b`, 'i');
    if (brandPattern.test(line)) return line.replace(brandPattern, '');
    return line;
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

  const cleanSegments = (text, brandName = '') => {
    if (!text) return [];
    const normalized = text.replace(/\r\n/g, '\n').replace(/\u200b/g, '');
    const brandKey = brandName ? normalizeValue(brandName) : '';
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
    return segments.filter(({ raw, detection, lower, isBlank }) => {
      if (isBlank) return true;
      if (brandKey && normalizeValue(raw) === brandKey) return false;
      if (brandKey && normalizeValue(detection) === brandKey) return false;

      if (detection.length === 1 && !/[aAiI]/.test(detection)) return false;
      if (/^[\d\W]+$/.test(detection)) return false;

      return true;
    });
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

      if (['like', 'comment', 'share', 'facebook', 'write a comment', 'press enter to post'].includes(lower)) return;
      if (/^\d+\s+(likes|comments|shares)$/.test(lower)) return;
      if (['sponsored', 'facebook', 'ad library'].includes(lower)) return;

      if (!ctaLabel && CTA_LABEL_SET.has(lower)) {
        ctaLabel = detection;
        return;
      }

      const domainCandidate = detection.replace(/^https?:\/\//i, '');
      if (!domain && DOMAIN_ONLY_PATTERN.test(domainCandidate)) {
        domain = detection;
        return;
      }

      if (!headline && detection.length < 100 && detection.length > 10 && !detection.includes('\n')) {
        if (!detection.includes('.') && detection === detection.replace(/\s+/g, ' ').trim()) {
          headline = detection;
          return;
        }
      }

      if (domain && headline && descriptionParts.length === 0) {
        descriptionParts.push(detection);
        return;
      }

      primary.push(raw);
    });

    return {
      primaryText: primary.join('\n').trim(),
      domain,
      headline,
      description: descriptionParts.join('\n').trim(),
      ctaLabel
    };
  };

  const parseAdText = (text, brandName = '') => {
    const rawText = text || '';
    const segments = removeTruncatedPreviews(cleanSegments(rawText, brandName));
    const result = categorizeSegments(segments);
    if (!result.primaryText && rawText.trim()) {
      result.primaryText = rawText.trim();
    }
    const primaryOnly = (result.primaryText || '')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const fullAdCopy = primaryOnly || rawText.trim();
    return { rawText, fullAdCopy, ...result };
  };

  global.SwipekitText = {
    parseAdText
  };
})(typeof window !== 'undefined' ? window : globalThis);

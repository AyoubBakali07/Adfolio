(() => {
  const CARD_ATTR = 'data-swipekit-lite';
  const SELECTORS = {
    'facebook-feed': "div[role='article']",
    instagram: 'article'
  };

  const injectStyles = () => {
    if (document.getElementById('swipekit-lite-styles')) return;
    const style = document.createElement('style');
    style.id = 'swipekit-lite-styles';
    style.textContent = `
      .swipekit-save-btn-clean {
        display: block;
        width: 100%;
        margin-top: 10px;
        padding: 10px 0;
        border-radius: 6px;
        background: linear-gradient(90deg, #4338ca, #6366f1);
        color: #fff;
        border: none;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(79, 70, 229, 0.35);
      }
      .swipekit-save-btn-clean:hover {
        filter: brightness(1.05);
      }
      .swipekit-save-btn-clean:disabled {
        opacity: 0.55;
        cursor: default;
        filter: none;
      }
      .swipekit-toast {
        position: fixed;
        right: 24px;
        bottom: 24px;
        background: #141414;
        color: #fff;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25);
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

  const getUrlInfo = () => {
    const url = window.location.href.toLowerCase();
    const isFacebook = url.includes('facebook.com');
    const isInstagram = url.includes('instagram.com');
    
    // More comprehensive check for Ad Library pages
    const isAdLibrarySearch = isFacebook && (
      url.includes('/ads/library') || 
      url.includes('/ads/archive') ||
      url.includes('/ads/adlibrary') ||
      document.querySelector('div[role="main"] [aria-label*="Ad Library"]') ||
      document.querySelector('a[href*="/ads/library/"]') ||
      document.querySelector('div[role="button"][aria-label*="Ad Library"]')
    );
    
    console.log('URL info:', { url, isFacebook, isInstagram, isAdLibrarySearch });
    return { isFacebook, isInstagram, isAdLibrarySearch };
  };

  const detectPlatform = () => {
    const info = getUrlInfo();
    if (info.isInstagram) return 'instagram';
    if (info.isAdLibrarySearch) return 'facebook-ad-library';
    return 'facebook-feed';
  };

  const createId = () => (crypto?.randomUUID ? crypto.randomUUID() : `swipe-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const normalizeMediaUrl = (value) => {
    if (!value) return null;
    const src = value.trim();
    if (!src || src.startsWith('data:')) return null;
    try {
      return new URL(src, window.location.href).toString();
    } catch {
      return src;
    }
  };

  const collectImages = (card) => {
    const urls = new Set();
    card.querySelectorAll('img').forEach((img) => {
      const src = normalizeMediaUrl(img.currentSrc || img.src || '');
      if (src) urls.add(src);
    });
    return Array.from(urls);
  };

  const collectVideos = (card) => {
    const urls = new Set();
    card.querySelectorAll('video').forEach((video) => {
      const candidates = [video.currentSrc, video.src];
      video.querySelectorAll('source').forEach((source) => candidates.push(source.src));
      candidates.forEach((candidate) => {
        const src = normalizeMediaUrl(candidate || '');
        if (src) urls.add(src);
      });
    });
    return Array.from(urls);
  };

  const sanitizeText = (text) => text.replace(/\s+/g, ' ').trim();

  const getCardText = (card) => {
    const TEXT_LIMIT = 4000;
    const clone = card.cloneNode(true);
    clone.querySelectorAll('.swipekit-save-btn-clean').forEach((node) => node.remove());
    return sanitizeText(clone.innerText || '').slice(0, TEXT_LIMIT);
  };

  const captureCard = (card) => ({
    id: createId(),
    platform: detectPlatform(),
    capturedAt: new Date().toISOString(),
    pageUrl: window.location.href,
    text: getCardText(card),
    imageUrls: collectImages(card),
    videoUrls: collectVideos(card),
    extra: {}
  });

  const showToast = (message, isError = false) => {
    const toast = document.createElement('div');
    toast.className = 'swipekit-toast';
    toast.textContent = message;
    if (isError) toast.style.background = '#c0392b';
    (document.body || document.documentElement).appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('swipekit-visible'));
    setTimeout(() => {
      toast.classList.remove('swipekit-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  };

  const handleSave = (card, button) => {
    const item = captureCard(card);
    if (!item.text && !item.imageUrls.length && !item.videoUrls.length) {
      showToast('Swipekit: nothing to capture', true);
      return;
    }
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Saving...';
    chrome.runtime.sendMessage({ type: 'SAVE_AD_ITEM', item }, (response) => {
      button.disabled = false;
      if (chrome.runtime.lastError) {
        button.textContent = original;
        showToast('Swipekit save failed', true);
        return;
      }
      if (response?.ok) {
        button.textContent = 'Saved';
        showToast('Saved to Swipe');
        setTimeout(() => (button.textContent = original), 1500);
      } else {
        button.textContent = original;
        showToast('Swipekit save failed', true);
      }
    });
  };

  const isVisible = (node) => !!(node && node.offsetParent);

  const isAdLibraryCard = (card) => {
    if (!isVisible(card)) return false;
    
    // Check if this is a Facebook Ad Library card by looking for common patterns
    const text = (card.textContent || '').toLowerCase();
    const hasLibraryId = /library id/i.test(text);
    const hasAdDetails = /see ad details/i.test(text);
    const hasActiveText = /active|started running on/i.test(text);
    const hasPlatforms = /platforms/i.test(text);
    
    // It's likely an ad card if it has these patterns
    return hasLibraryId || (hasAdDetails && (hasActiveText || hasPlatforms));
  };

  const findFacebookAdLibraryCards = () => {
    const set = new Set();
    
    // First, try to find cards by their specific structure
    // Look for the main card container with class x1plvlek
    const cardContainers = document.querySelectorAll('div.x1plvlek');
    
    // If we found containers with x1plvlek class, use those
    if (cardContainers.length > 0) {
      cardContainers.forEach(card => {
        if (isAdLibraryCard(card)) {
          set.add(card);
        }
      });
    }
    
    // If we still don't have any cards, try more generic selectors
    if (set.size === 0) {
      const selectors = [
        'div[role="article"]',
        'div[data-pagelet^="FeedUnit"]',
        'div[data-testid^="fbfeed"]',
        'div[data-ad-preview="message"]',
        'div[class*="x1y332"]',
        'div[class*="x1n2onr6"]'
      ];
      
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(node => {
          if (isAdLibraryCard(node)) {
            set.add(node);
          }
        });
      });
    }
    
    console.log(`Found ${set.size} potential ad cards`);
    return Array.from(set);
  };

  const getCardCandidates = () => {
    const platform = detectPlatform();
    if (platform === 'facebook-ad-library') {
      if (!getUrlInfo().isAdLibrarySearch) return [];
      return findFacebookAdLibraryCards();
    }
    const selector = SELECTORS[platform];
    if (!selector) return [];
    return Array.from(document.querySelectorAll(selector)).filter(isVisible);
  };

  const findAdDetailsButton = (card) => {
    // First try to find by specific class and text content
    const buttons = card.querySelectorAll('div[role="button"].x193iq5w');
    let button = Array.from(buttons).find(node => 
      /see ad details/i.test((node.textContent || '').trim())
    );
    
    // If not found, try to find by text content in any button-like element
    if (!button) {
      const allButtons = card.querySelectorAll('a, button, div[role="button"], span[role="button"]');
      button = Array.from(allButtons).find(node => 
        /see ad details/i.test((node.textContent || '').trim()) ||
        (node.getAttribute('aria-label') && /see ad details/i.test(node.getAttribute('aria-label')))
      );
    }
    
    // If still not found, try to find by common selectors
    if (!button) {
      button = card.querySelector('[data-testid="ad-details-button"], [aria-label*="Ad Details"], [href*="/ads/library"]');
    }
    
    return button || null;
  };

  const attachButton = (card) => {
    if (card.hasAttribute(CARD_ATTR)) return;
    if (card.querySelector('.swipekit-save-btn-clean')) return;
    
    // Find the ad details button
    const adDetails = findAdDetailsButton(card);
    if (!adDetails || !adDetails.parentElement) {
      console.log('Could not find ad details button in card');
      return;
    }
    
    // Create the save button
    const button = document.createElement('button');
    button.type = 'button';
    // Add a specific class and remove any existing ones to avoid conflicts
    button.className = 'swipekit-save-btn-clean x1i10hfl xjqpnuy xc5r6h4 xqeqjp1 x1phubyo x972fbf x10w94by x1qhh985 x14e42zd x9f619 x1ypdohk x3ct3a4 xdj266r x14z9mp xat24cr x1lziwak x2lwn1j xeuugli x16tdsg8 xggy1nq x1ja2u2z x1t137rt x6s0dn4 x1ejq31n x18oe1m7 x1sy0etr xstzfhl xdl72j9 x1q0g3np x193iq5w x1n2onr6 x1hl2dhg x87ps6o xxymvpz xlh3980 xvmahel x1lku1pv x1g2r6go x16e9yqp x12w9bfk x15406qy x1i5p2am x1whfx0g xr2y4jy x1ihp6rs xo1l8bm x108nfp6 xas4zb2 x1y1aw1k xwib8y2 xf7dkkf xv54qhq x78zum5 x1iyjqo2 xs83m0k';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.gap = '6px';
    button.style.marginTop = '8px';
    button.style.padding = '8px 12px';
    button.style.borderRadius = '6px';
    button.style.background = '#7B61FF';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.fontWeight = '600';
    button.style.fontSize = '14px';
    button.style.cursor = 'pointer';
    button.style.width = '100%';
    button.style.boxSizing = 'border-box';
    button.style.transition = 'background 0.2s';
    button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    
    // Add hover effect
    button.onmouseover = () => button.style.background = '#6B51E8';
    button.onmouseout = () => button.style.background = '#7B61FF';
    
    // Add save icon
    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('width', '16');
    iconSvg.setAttribute('height', '16');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.style.fill = 'white';
    iconSvg.innerHTML = '<path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/>';
    
    const buttonText = document.createTextNode('SAVE');
    
    button.appendChild(buttonText);
    button.appendChild(iconSvg);
    
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleSave(card, button);
    });
    
    // Find the parent container that holds the ad details button
    // In the provided HTML, we want to find the parent div with class 'x193iq5w xxymvpz xeuugli...'
    let container = adDetails.closest('div[class*="x193iq5w"]');
    
    if (container) {
      // Create a new container for the button to ensure proper spacing
      const buttonContainer = document.createElement('div');
      buttonContainer.style.marginTop = '8px';
      buttonContainer.style.width = '100%';
      buttonContainer.appendChild(button);
      
      // Insert the button container after the ad details button's container
      container.parentNode.insertBefore(buttonContainer, container.nextSibling);
    } else {
      // Fallback: try to find the parent container with class x1plvlek (ad card)
      const adCard = card.closest('.x1plvlek');
      if (adCard) {
        // Find the container that likely holds the buttons
        const buttonsContainer = adCard.querySelector('.x193iq5w.xxymvpz');
        if (buttonsContainer) {
          const buttonContainer = document.createElement('div');
          buttonContainer.style.marginTop = '8px';
          buttonContainer.style.width = '100%';
          buttonContainer.appendChild(button);
          buttonsContainer.parentNode.insertBefore(buttonContainer, buttonsContainer.nextSibling);
        } else {
          // Last resort: append to the card
          card.appendChild(button);
        }
      } else {
        // If all else fails, insert after the ad details button
        adDetails.parentNode.insertBefore(button, adDetails.nextSibling);
      }
    }
    
    card.setAttribute(CARD_ATTR, 'true');
  };

  const scan = () => {
    // Add a delay to ensure the page is fully loaded
    setTimeout(() => {
      console.log('Starting scan for ad cards...');
      const cards = getCardCandidates();
      console.log(`Found ${cards.length} ad cards to process`);
      
      if (cards.length === 0) {
        console.log('No ad cards found. Current page content:', {
          url: window.location.href,
          isAdLibrary: getUrlInfo().isAdLibrarySearch,
          platform: detectPlatform()
        });
      }
      
      cards.forEach((card, index) => {
        try {
          console.log(`Processing card ${index + 1}`, card);
          attachButton(card);
        } catch (error) {
          console.error(`Error processing card ${index + 1}:`, error);
        }
      });
      
      // If we're in the ad library but didn't find any cards, try again in case of lazy loading
      if (getUrlInfo().isAdLibrarySearch && cards.length === 0) {
        console.log('No cards found on first try, scheduling rescan...');
        setTimeout(scan, 2000);
      }
    }, 2000); // Increased delay to ensure Facebook's JS has finished
  };

  const init = () => {
    injectStyles();
    
    // Initial scan
    scan();
    
    // Set up MutationObserver to detect new ad cards being loaded
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          shouldScan = true;
        }
      });
      if (shouldScan) {
        scan();
      }
    });
    
    // Start observing the document with the configured parameters
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Also scan periodically as a fallback
    setInterval(scan, 2000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

// Linzu Clean for X - Content Script
console.log('[Linzu] Starting...');

// Safety: Wrap everything in a try-catch to prevent crashing the page
try {

// State
let appSettings = {
  isEnabled: true,
  removedCount: 0,
  filterDuplicates: false,
  filterVerified: false,
  filterLanguage: 'all', // 'all', 'ja', 'en'
  filterContent: {
    imageOnly: false,
    shortPost: false,
    excessiveLinks: false
  },
  filterBot: {
    digits: false,
    defaultIcon: false,
    emoji: false,
    links: false
  },
  customKeywords: []
};

// Dynamic State (Session only)
let dynamicSettings = {
  ownerOnly: false,
  focusUser: ''
};

// Counters (Session Only)
let localRemovedCount = 0;
let sessionDynamicHiddenCount = 0;

// URL Tracking for reset
let lastUrl = location.href;

// Seen texts for duplicate detection (TextHash -> Count)
const seenTexts = new Set();


// Helper to update text content of UI elements
function updateUIText() {
  try {
    const title = document.querySelector('.linzu-title');
    const statsLabel = document.querySelector('.linzu-stats-label');
    const settingsBtn = document.querySelector('.linzu-settings-btn');
    const ownerLabel = document.querySelector('label[for="linzu-owner"]');
    const searchInput = document.getElementById('linzu-search');

    if (title) title.textContent = LinzuI18n.t('appTitle');
    if (statsLabel) statsLabel.textContent = LinzuI18n.t('ui_removed');
    if (settingsBtn) settingsBtn.textContent = LinzuI18n.t('ui_settings');

    if (ownerLabel) ownerLabel.lastChild.textContent = LinzuI18n.t('ui_dynamic_owner');
    if (searchInput) searchInput.placeholder = LinzuI18n.t('ui_dynamic_search');
  } catch (e) {
    console.error('[Linzu] Error updating UI text:', e);
  }
}

function updateCounterDisplay() {
  try {
    const countDisplay = document.getElementById('linzu-count');
    if (countDisplay) {
      const total = localRemovedCount + sessionDynamicHiddenCount;
      countDisplay.textContent = total;
    }
  } catch (e) {
    console.error('[Linzu] Error updating counter:', e);
  }
}

function injectFloatingUI() {
  try {
    if (document.getElementById('linzu-floating-ui')) return;

    const uiContainer = document.createElement('div');
    uiContainer.id = 'linzu-floating-ui';
    uiContainer.className = 'linzu-ignore'; // Mark for observer to ignore
    uiContainer.innerHTML = `
      <div class="linzu-header">
        <span class="linzu-title">${LinzuI18n.t('appTitle')}</span>
        <label class="linzu-switch">
          <input type="checkbox" id="linzu-toggle">
          <span class="linzu-slider round"></span>
        </label>
      </div>

      <div class="linzu-controls">
        <label class="linzu-control-item" for="linzu-owner">
          <input type="checkbox" id="linzu-owner"> ${LinzuI18n.t('ui_dynamic_owner')}
        </label>
        <input type="text" id="linzu-search" class="linzu-search-input" placeholder="${LinzuI18n.t('ui_dynamic_search')}">
      </div>

      <div class="linzu-stats">
        <span class="linzu-stats-label">${LinzuI18n.t('ui_removed')}</span> <span id="linzu-count">0</span>
      </div>

      <div class="linzu-footer">
          <a href="#" class="linzu-settings-btn">${LinzuI18n.t('ui_settings')}</a>
      </div>
    `;

    if (!document.body) {
        console.warn('[Linzu] document.body not ready');
        return;
    }

    document.body.appendChild(uiContainer);
    console.log('[Linzu] UI Injected');

    const toggle = document.getElementById('linzu-toggle');
    const ownerCheckbox = document.getElementById('linzu-owner');
    const searchInput = document.getElementById('linzu-search');
    const settingsBtn = document.querySelector('.linzu-settings-btn');

    // Load initial state (Storage)
    loadSettings(() => {
      toggle.checked = appSettings.isEnabled;
      updateCounterDisplay();
    });

    // Toggle Event Listener
    toggle.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      chrome.storage.local.set({ isEnabled: isEnabled });

      if (!isEnabled) {
         applyDynamicFilters();
      } else {
         const articles = document.querySelectorAll('article[data-testid="tweet"]');
         scanNodes(articles);
         applyDynamicFilters();
      }
    });

    // Dynamic Controls Listeners (Direct)
    if (ownerCheckbox) {
      ownerCheckbox.addEventListener('change', (e) => {
        dynamicSettings.ownerOnly = e.target.checked;
        applyDynamicFilters();
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        dynamicSettings.focusUser = e.target.value.trim().replace(/^@/, '');
        applyDynamicFilters();
      });
    }

    // Settings Button Listener (Message passing)
    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        chrome.runtime.sendMessage({ action: 'openOptions' });
      } catch(err) {
        console.error('[Linzu] Failed to send openOptions message:', err);
      }
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.isEnabled) appSettings.isEnabled = changes.isEnabled.newValue;
        // removedCount from storage ignored for display (using local)
        if (changes.filterDuplicates) appSettings.filterDuplicates = changes.filterDuplicates.newValue;
        if (changes.filterVerified) appSettings.filterVerified = changes.filterVerified.newValue;
        if (changes.filterLanguage) appSettings.filterLanguage = changes.filterLanguage.newValue;
        if (changes.filterContent) appSettings.filterContent = changes.filterContent.newValue;
        if (changes.filterBot) appSettings.filterBot = changes.filterBot.newValue;
        if (changes.customKeywords) appSettings.customKeywords = changes.customKeywords.newValue;

        if (changes.language) {
          LinzuI18n.setLocale(changes.language.newValue, () => {
            updateUIText();
          });
        }

        if (changes.isEnabled) {
          toggle.checked = changes.isEnabled.newValue;
        }
      }
    });
  } catch (e) {
    console.error('[Linzu] Error injecting UI:', e);
  }
}

function loadSettings(callback) {
  chrome.storage.local.get(null, (result) => {
    appSettings = { ...appSettings, ...result };
    if (callback) callback();
  });
}

// --- Dynamic Filtering Logic Helpers ---

function getUsername(article) {
  try {
    const userNameDiv = article.querySelector('[data-testid="User-Name"]');
    if (userNameDiv) {
      const textContent = userNameDiv.textContent;
      const match = textContent.match(/@([a-zA-Z0-9_]+)/);
      if (match) return match[1];
    }

    const links = article.querySelectorAll('a[href^="/"]');
    for (let link of links) {
        const href = link.getAttribute('href');
        if (href && href.length > 1 && !href.includes('/status/')) {
            return href.substring(1);
        }
    }

    const text = article.innerText;
    const match = text.match(/@([a-zA-Z0-9_]+)/);
    if (match) return match[1];
  } catch (e) {
  }
  return null;
}

function applyDynamicFilters() {
  try {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');

    sessionDynamicHiddenCount = 0;

    if (!appSettings.isEnabled) {
        articles.forEach(article => {
            if (article.dataset.linzuDynamicHidden) {
                article.style.display = '';
                delete article.dataset.linzuDynamicHidden;
            }
        });
        updateCounterDisplay();
        return;
    }

    let currentProfileOwner = null;

    try {
        if (document.body.dataset.linzuMockOwner) {
            currentProfileOwner = document.body.dataset.linzuMockOwner;
        } else {
            const pathParts = window.location.pathname.split('/');
            if (pathParts.length >= 2 && pathParts[1]) {
                const nonUserPaths = ['home', 'explore', 'notifications', 'messages', 'search', 'settings'];
                if (!nonUserPaths.includes(pathParts[1])) {
                    currentProfileOwner = pathParts[1];
                }
            }
        }
    } catch(e) {}

    articles.forEach(article => {
      if (article.dataset.linzuHidden === "true") return;

      let shouldHide = false;
      const username = getUsername(article);

      // 1. Owner Only
      if (dynamicSettings.ownerOnly && currentProfileOwner) {
          if (username !== currentProfileOwner) {
              shouldHide = true;
          }
      }

      // 2. Focus User
      if (!shouldHide && dynamicSettings.focusUser) {
          if (username !== dynamicSettings.focusUser) {
              shouldHide = true;
          }
      }

      if (shouldHide) {
          article.style.display = 'none';
          article.dataset.linzuDynamicHidden = "true";
          sessionDynamicHiddenCount++;
      } else {
          if (article.dataset.linzuDynamicHidden) {
              article.style.display = '';
              delete article.dataset.linzuDynamicHidden;
          }
      }
    });

    updateCounterDisplay();
  } catch (e) {
    console.error('[Linzu] Error applying dynamic filters:', e);
  }
}


// --- Filtering Logic (Permanent) ---

function removeTweet(article, reason) {
  if (article.style.display === 'none' || article.dataset.linzuHidden === "true") return;

  article.style.display = 'none';
  article.dataset.linzuHidden = "true";

  console.log(`[Linzu Clean] Removed (${reason}):`, article.innerText.substring(0, 30));

  localRemovedCount++;
  updateCounterDisplay();
}

// 1. Duplicate Check
function checkDuplicate(text) {
  if (!appSettings.filterDuplicates) return false;
  if (!text || text.length < 5) return false;

  const key = text.trim();
  if (seenTexts.has(key)) return true;
  seenTexts.add(key);
  return false;
}

// 2. Language Check
function checkLanguage(article) {
  if (appSettings.filterLanguage === 'all') return false;
  const langDiv = article.querySelector('div[lang]');
  if (!langDiv) return false;
  const lang = langDiv.getAttribute('lang');

  if (appSettings.filterLanguage === 'ja') return lang !== 'ja';
  if (appSettings.filterLanguage === 'en') return lang !== 'en';
  return false;
}

// 3. Content Check
function checkContent(article, text) {
  if (appSettings.filterContent?.imageOnly) {
     const hasMedia = article.querySelector('div[data-testid="tweetPhoto"]') || article.querySelector('div[data-testid="videoPlayer"]');
     if (!text.trim() && hasMedia) return true;
  }
  if (appSettings.filterContent?.shortPost) {
    if (text.trim().length > 0 && text.trim().length <= 5) return true;
  }
  if (appSettings.filterContent?.excessiveLinks) {
     const links = (text.match(/https?:\/\//g) || []).length;
     const tags = (text.match(/#/g) || []).length;
     if (links + tags >= 5) return true;
  }
  return false;
}

// 4. Verified Account Check
function checkVerified(article) {
  if (!appSettings.filterVerified) return false;
  const verifiedIcon = article.querySelector('svg[data-testid="icon-verified"]');
  if (verifiedIcon) return true;
  const verifiedAria = article.querySelector('svg[aria-label="Verified account"]');
  if (verifiedAria) return true;
  return false;
}

// 5. Custom Keywords
function checkCustomKeywords(text) {
  if (!appSettings.customKeywords || appSettings.customKeywords.length === 0) return false;
  for (const keyword of appSettings.customKeywords) {
    if (text.includes(keyword)) return true;
  }
  return false;
}

// 6. Bot Detection (New)
function checkBotDigits(article, handle) {
    if (!appSettings.filterBot?.digits) return false;
    if (!handle) return false;
    // Check if handle ends with 5+ digits
    if (/\d{5,}$/.test(handle)) return true;
    return false;
}

function checkBotDefaultIcon(article) {
    if (!appSettings.filterBot?.defaultIcon) return false;
    // Look for img with src containing "default_profile_images" or specific structure
    // Or alt="Image" but generic
    const userAvatar = article.querySelector('div[data-testid="Tweet-User-Avatar"] img');
    if (userAvatar) {
        const src = userAvatar.getAttribute('src') || "";
        if (src.includes('default_profile_images')) return true;
    }
    return false;
}

function checkBotEmoji(article, fullText) {
    if (!appSettings.filterBot?.emoji) return false;

    // Target specific tweet text to avoid username/date counting
    const tweetTextNode = article.querySelector('div[data-testid="tweetText"]');
    const contentText = tweetTextNode ? tweetTextNode.innerText.trim() : "";

    // If we found specific text node, check its length
    if (tweetTextNode) {
        if (contentText.length > 0 && contentText.length <= 3) return true;
    } else {
        // Fallback: If no tweetText div found (maybe image only or different structure),
        // we might skip or be conservative.
        // If fullText is extremely short (unlikely due to username), we might hide.
        // But better to rely on tweetText presence for this filter.
    }

    return false;
}

function checkBotLinks(article) {
    if (!appSettings.filterBot?.links) return false;

    // Check external links in tweet text only
    const tweetTextNode = article.querySelector('div[data-testid="tweetText"]');
    const contentText = tweetTextNode ? tweetTextNode.innerText : article.innerText;

    if (contentText.match(/https?:\/\/(?!x\.com|twitter\.com)/)) return true;

    return false;
}


function processTweet(article) {
  try {
    if (article.dataset.linzuChecked) return;
    article.dataset.linzuChecked = "true";

    const text = article.innerText || "";
    const handle = getUsername(article);

    // Check Bot Filters First
    if (checkBotDigits(article, handle)) {
        removeTweet(article, 'Bot: Digits in ID');
        return;
    }
    if (checkBotDefaultIcon(article)) {
        removeTweet(article, 'Bot: Default Icon');
        return;
    }
    if (checkBotEmoji(article, text)) {
        removeTweet(article, 'Bot: Emoji/Short');
        return;
    }
    if (checkBotLinks(article)) {
        removeTweet(article, 'Bot: External Link');
        return;
    }

    if (checkLanguage(article)) {
      removeTweet(article, 'Language Filter');
      return;
    }
    if (checkDuplicate(text)) {
      removeTweet(article, 'Duplicate');
      return;
    }
    if (checkVerified(article)) {
      removeTweet(article, 'Verified Account');
      return;
    }
    if (checkContent(article, text)) {
      removeTweet(article, 'Content Restriction');
      return;
    }
    if (checkCustomKeywords(text)) {
      removeTweet(article, 'Custom Keyword');
      return;
    }
  } catch (e) {
    console.error('[Linzu] Error processing tweet:', e);
  }
}

function scanNodes(nodes) {
  try {
    const elements = Array.from(nodes).filter(node => node.nodeType === 1);

    elements.forEach(node => {
        if (node.id === 'linzu-floating-ui' || node.classList.contains('linzu-ignore')) return;

        if (node.tagName === 'ARTICLE' && node.getAttribute('data-testid') === 'tweet') {
            processTweet(node);
        }

        if (node.querySelectorAll) {
            const articles = node.querySelectorAll('article[data-testid="tweet"]');
            articles.forEach(processTweet);
        }
    });
    applyDynamicFilters();
  } catch (e) {
    console.error('[Linzu] Error in scanNodes:', e);
  }
}

// Reset logic
function resetSession() {
    localRemovedCount = 0;
    sessionDynamicHiddenCount = 0;
    seenTexts.clear();
    lastUrl = location.href;
    updateCounterDisplay();
    console.log('[Linzu] Session reset due to navigation.');
}

LinzuI18n.init(() => {
  injectFloatingUI();

  // Start Observer only after init
  startObserver();
});

function startObserver() {
  console.log('[Linzu] Starting Observer...');
  const observer = new MutationObserver((mutations) => {
    if (!appSettings.isEnabled) return;

    // Check URL change
    if (location.href !== lastUrl) {
        resetSession();
    }

    const addedNodes = [];
    mutations.forEach(mutation => {
      if (mutation.target.id === 'linzu-floating-ui' || mutation.target.closest('#linzu-floating-ui')) {
          return;
      }

      if (mutation.addedNodes.length > 0) {
        addedNodes.push(...mutation.addedNodes);
      }
    });

    if (addedNodes.length > 0) {
      scanNodes(addedNodes);
    }
  });

  if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      console.log('[Linzu] Observer Started');
  } else {
      console.warn('[Linzu] document.body not ready for observer');
  }
}

// Expose for testing
window.setDynamicSettings = function(settings) {
    dynamicSettings = { ...dynamicSettings, ...settings };
    applyDynamicFilters();
};

window.mockNavigation = function(newUrl) {
    history.pushState({}, "", newUrl);
    // Observer checks location.href which updates.
    // But MutationObserver only fires on DOM mutation.
    // If navigation doesn't mutate DOM immediately, reset might lag.
    // But SPA navigation ALWAYS mutates DOM.
    // Trigger fake mutation for test?
    document.body.setAttribute('data-navigated', 'true');
};

} catch (globalError) {
    console.error('[Linzu] CRITICAL ERROR:', globalError);
}

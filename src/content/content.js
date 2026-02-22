// Linzu Clean for X - Content Script
console.log('[Linzu] Starting...');

// Safety: Wrap everything in a try-catch to prevent crashing the page
try {

// State
let appSettings = {
  isEnabled: true,
  removedCount: 0,
  isMinimized: false,
  filterDuplicates: false,
  filterUnverified: false,
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

// Observer instance
let observer = null;

// Duplicate Detection: Map<TextHash, Set<StatusID>>
// We store seen content text mapped to the Status IDs that have it.
const seenContent = new Map();
const seenStatusIds = new Set();

// Thread Spam Tracking
// Map<UserHandle, Count>
const threadReplyCounts = new Map();
let currentThreadOP = null;


// Helper to update text content of UI elements
function updateUIText() {
  try {
    const title = document.querySelector('.linzu-title');
    const statsLabel = document.querySelector('.linzu-stats-label');
    const settingsBtn = document.querySelector('.linzu-settings-btn');
    const hideBtn = document.getElementById('linzu-hide-panel');
    const ownerLabel = document.querySelector('label[for="linzu-owner"]');
    const searchInput = document.getElementById('linzu-search');

    if (title) title.textContent = LinzuI18n.t('appTitle');
    if (statsLabel) statsLabel.textContent = LinzuI18n.t('ui_removed');
    if (settingsBtn) settingsBtn.textContent = LinzuI18n.t('ui_settings');
    if (hideBtn) hideBtn.textContent = LinzuI18n.t('ui_hide_panel');

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
          <button id="linzu-hide-panel" class="linzu-hide-btn">${LinzuI18n.t('ui_hide_panel')}</button>
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
    const hideBtn = document.getElementById('linzu-hide-panel');

    // Load initial state (Storage)
    loadSettings(() => {
      toggle.checked = appSettings.isEnabled;
      // Apply minimized state
      if (appSettings.isMinimized) {
          uiContainer.classList.add('linzu-minimized');
      }
      updateCounterDisplay();
    });

    // Toggle Event Listener
    toggle.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      chrome.storage.local.set({ isEnabled: isEnabled });

      if (!isEnabled) {
         if (observer) observer.disconnect();
         restoreAllVisibility();
         console.log('[Linzu] Extension Disabled. Filters cleared.');
      } else {
         // Re-enable
         startObserver();
         const articles = document.querySelectorAll('article[data-testid="tweet"]');
         scanNodes(articles);
      }
    });

    // Hide Panel Button Listener
    hideBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        appSettings.isMinimized = true;
        uiContainer.classList.add('linzu-minimized');
        chrome.storage.local.set({ isMinimized: true });
    });

    // Expand Listener (Click on container when minimized)
    uiContainer.addEventListener('click', (e) => {
        if (uiContainer.classList.contains('linzu-minimized')) {
            appSettings.isMinimized = false;
            uiContainer.classList.remove('linzu-minimized');
            chrome.storage.local.set({ isMinimized: false });
        }
    });

    // Prevent container click logic from interfering with controls when Expanded
    const interactiveElements = uiContainer.querySelectorAll('input, button, a, label');
    interactiveElements.forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
        });
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
        if (changes.isMinimized) {
            appSettings.isMinimized = changes.isMinimized.newValue;
            if (appSettings.isMinimized) {
                uiContainer.classList.add('linzu-minimized');
            } else {
                uiContainer.classList.remove('linzu-minimized');
            }
        }
        if (changes.removedCount) {
          appSettings.removedCount = changes.removedCount.newValue;
          updateCounterDisplay();
        }
        if (changes.filterDuplicates) appSettings.filterDuplicates = changes.filterDuplicates.newValue;
        if (changes.filterUnverified) appSettings.filterUnverified = changes.filterUnverified.newValue;
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
    // Backward compatibility for filterVerified -> filterUnverified
    if (result.filterUnverified === undefined) {
        if (result.filterVerified && typeof result.filterVerified === 'object') {
            appSettings.filterUnverified = result.filterVerified.non_blue;
        }
    }
    if (callback) callback();
  });
}

// --- Logic Helpers ---

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

function getStatusId(article) {
    try {
        const links = article.querySelectorAll('a[href*="/status/"]');
        for (let link of links) {
            const href = link.getAttribute('href');
            const match = href.match(/\/status\/(\d+)/);
            if (match) return match[1];
        }
    } catch(e) {}
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

      if (dynamicSettings.ownerOnly && currentProfileOwner) {
          if (username !== currentProfileOwner) shouldHide = true;
      }
      if (!shouldHide && dynamicSettings.focusUser) {
          if (username !== dynamicSettings.focusUser) shouldHide = true;
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

// 1. Duplicate Check (Status ID)
function checkDuplicate(text, statusId) {
  if (!appSettings.filterDuplicates) return false;
  if (!text || text.length < 5) return false;
  if (!statusId) return false;

  if (seenStatusIds.has(statusId)) return false;

  const contentKey = text.trim();
  if (seenContent.has(contentKey)) {
      return true;
  }

  seenContent.set(contentKey, statusId);
  seenStatusIds.add(statusId);
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
function checkContent(article, text, handle) {
  // If user is OP, skip image-only filter
  const isOP = currentThreadOP && handle === currentThreadOP;

  if (appSettings.filterContent?.imageOnly) {
     if (!isOP) { // Only apply if not OP
         const hasTextDiv = article.querySelector('div[data-testid="tweetText"]');
         const hasMedia = article.querySelector('div[data-testid="tweetPhoto"]') || article.querySelector('div[data-testid="videoPlayer"]');

         // If no text div AND has media -> Image Only
         if (!hasTextDiv && hasMedia) return true;
         // If text div exists but is empty
         if (hasTextDiv && !hasTextDiv.innerText.trim() && hasMedia) return true;
     }
  }
  if (appSettings.filterContent?.shortPost) {
    // Only check length if text div exists, to avoid checking metadata
    const hasTextDiv = article.querySelector('div[data-testid="tweetText"]');
    if (hasTextDiv && text.trim().length > 0 && text.trim().length <= 5) return true;
  }
  if (appSettings.filterContent?.excessiveLinks) {
     const links = (text.match(/https?:\/\//g) || []).length;
     const tags = (text.match(/#/g) || []).length;
     if (links + tags >= 5) return true;
  }
  return false;
}

// 4. Verified Account Check (UNVERIFIED)
function checkUnverified(article) {
  if (!appSettings.filterUnverified) return false;

  // Look for verified icon in User-Name section
  const userNameDiv = article.querySelector('[data-testid="User-Name"]');
  if (!userNameDiv) return false; // Safety

  const verifiedIcon = userNameDiv.querySelector('svg[data-testid="icon-verified"]');

  // If NO verified icon found -> Unverified -> Hide
  if (!verifiedIcon) return true;

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

// 6. Bot Detection
function checkBotDigits(article, handle) {
    if (!appSettings.filterBot?.digits) return false;
    if (!handle) return false;
    if (/\d{5,}$/.test(handle)) return true;
    return false;
}

function checkBotDefaultIcon(article) {
    if (!appSettings.filterBot?.defaultIcon) return false;
    const userAvatar = article.querySelector('div[data-testid="Tweet-User-Avatar"] img');
    if (userAvatar) {
        const src = userAvatar.getAttribute('src') || "";
        if (src.includes('default_profile_images')) return true;
    }
    return false;
}

function checkBotEmoji(article, fullText) {
    if (!appSettings.filterBot?.emoji) return false;
    const tweetTextNode = article.querySelector('div[data-testid="tweetText"]');
    const contentText = tweetTextNode ? tweetTextNode.innerText.trim() : "";
    if (tweetTextNode) {
        if (contentText.length > 0 && contentText.length <= 3) return true;
    }
    return false;
}

function checkBotLinks(article) {
    if (!appSettings.filterBot?.links) return false;
    const tweetTextNode = article.querySelector('div[data-testid="tweetText"]');
    const contentText = tweetTextNode ? tweetTextNode.innerText : article.innerText;
    if (contentText.match(/https?:\/\/(?!x\.com|twitter\.com)/)) return true;
    return false;
}

// 7. Thread Spam Check
function checkThreadSpam(handle) {
    if (!appSettings.filterDuplicates) return false;
    const path = document.body.dataset.linzuMockPath || location.pathname;
    // Only apply if we are in a thread view
    if (!path.includes('/status/')) return false;
    if (!currentThreadOP) return false; // OP not found yet
    if (!handle) return false;

    // Don't filter OP
    if (handle === currentThreadOP) return false;

    // Check reply count
    const count = (threadReplyCounts.get(handle) || 0) + 1;
    threadReplyCounts.set(handle, count);

    if (count > 1) {
        // Remove 2nd onwards
        return true;
    }
    return false;
}


function processTweet(article) {
  try {
    if (article.dataset.linzuChecked) return;
    article.dataset.linzuChecked = "true";

    const handle = getUsername(article);
    const statusId = getStatusId(article);

    // Skip reprocessing same tweet ID (prevents re-render spam count)
    if (statusId && seenStatusIds.has(statusId)) return;

    // Extract pure text content for duplicate checking
    const tweetTextNode = article.querySelector('div[data-testid="tweetText"]');
    const contentText = tweetTextNode ? tweetTextNode.innerText : (article.innerText || "");
    const text = article.innerText || "";

    const path = document.body.dataset.linzuMockPath || location.pathname;

    // Identify OP if this is the first tweet in a thread view
    if (path.includes('/status/') && !currentThreadOP && statusId) {
        const urlStatusIdMatch = path.match(/\/status\/(\d+)/);
        if (urlStatusIdMatch && urlStatusIdMatch[1] === statusId) {
            currentThreadOP = handle;
            console.log('[Linzu] Identified Thread OP:', currentThreadOP);
            // Don't filter main tweet!
            return;
        }
    }

    // Skip filtering if it's the main tweet (by ID match)
    const urlStatusIdMatch = path.match(/\/status\/(\d+)/);
    if (urlStatusIdMatch && urlStatusIdMatch[1] === statusId) return;

    // Check Bot Filters
    if (checkBotDigits(article, handle)) { removeTweet(article, 'Bot: Digits'); return; }
    if (checkBotDefaultIcon(article)) { removeTweet(article, 'Bot: Icon'); return; }
    if (checkBotEmoji(article, contentText)) { removeTweet(article, 'Bot: Emoji'); return; }
    if (checkBotLinks(article)) { removeTweet(article, 'Bot: Link'); return; }

    if (checkLanguage(article)) { removeTweet(article, 'Language'); return; }
    if (checkDuplicate(contentText, statusId)) { removeTweet(article, 'Duplicate'); return; }

    // New Unverified check
    if (checkUnverified(article)) { removeTweet(article, 'Unverified Account'); return; }

    if (checkContent(article, contentText, handle)) { removeTweet(article, 'Content'); return; }
    if (checkCustomKeywords(contentText)) { removeTweet(article, 'Keyword'); return; }

    // Thread Spam (check last)
    if (checkThreadSpam(handle)) { removeTweet(article, 'Thread Spam'); return; }

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
    seenContent.clear();
    seenStatusIds.clear();
    threadReplyCounts.clear();
    currentThreadOP = null;
    lastUrl = location.href;
    updateCounterDisplay();
    console.log('[Linzu] Session reset due to navigation.');
}

function restoreAllVisibility() {
    const hiddenArticles = document.querySelectorAll('article[data-linzu-hidden="true"], article[data-linzu-dynamic-hidden="true"]');
    hiddenArticles.forEach(article => {
        article.style.display = '';
        delete article.dataset.linzuHidden;
        delete article.dataset.linzuDynamicHidden;
        delete article.dataset.linzuChecked;
    });
    updateCounterDisplay();
}

LinzuI18n.init(() => {
  injectFloatingUI();
  startObserver();
});

function startObserver() {
  if (observer) observer.disconnect(); // Safety

  console.log('[Linzu] Starting Observer...');
  observer = new MutationObserver((mutations) => {
    if (!appSettings.isEnabled) return;

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
};

} catch (globalError) {
    console.error('[Linzu] CRITICAL ERROR:', globalError);
}

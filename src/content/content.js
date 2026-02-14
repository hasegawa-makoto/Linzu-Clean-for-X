// Linzu Clean for X - Content Script
console.log('Linzu Clean: Content script loaded');

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
  customKeywords: []
};

// Dynamic State (Session only)
let dynamicSettings = {
  ownerOnly: false,
  focusUser: ''
};

// Counters
let sessionDynamicHiddenCount = 0;

// Seen texts for duplicate detection (TextHash -> Count)
const seenTexts = new Set();


// Helper to update text content of UI elements
function updateUIText() {
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
}

function updateCounterDisplay() {
  const countDisplay = document.getElementById('linzu-count');
  if (countDisplay) {
    const total = (appSettings.removedCount || 0) + sessionDynamicHiddenCount;
    countDisplay.textContent = total;
  }
}

function injectFloatingUI() {
  if (document.getElementById('linzu-floating-ui')) return;

  const uiContainer = document.createElement('div');
  uiContainer.id = 'linzu-floating-ui';
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
  document.body.appendChild(uiContainer);

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
       applyDynamicFilters(); // Logic inside handles disabled state
    } else {
       const articles = document.querySelectorAll('article');
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

  // Settings Button Listener (Message passing fix)
  settingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ action: 'openOptions' });
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.isEnabled) appSettings.isEnabled = changes.isEnabled.newValue;
      if (changes.removedCount) {
        appSettings.removedCount = changes.removedCount.newValue;
        updateCounterDisplay();
      }
      if (changes.filterDuplicates) appSettings.filterDuplicates = changes.filterDuplicates.newValue;
      if (changes.filterVerified) appSettings.filterVerified = changes.filterVerified.newValue;
      if (changes.filterLanguage) appSettings.filterLanguage = changes.filterLanguage.newValue;
      if (changes.filterContent) appSettings.filterContent = changes.filterContent.newValue;
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
}

function loadSettings(callback) {
  chrome.storage.local.get(null, (result) => {
    appSettings = { ...appSettings, ...result };
    if (callback) callback();
  });
}

// --- Dynamic Filtering Logic Helpers ---

function getUsername(article) {
  const userNameDiv = article.querySelector('[data-testid="User-Name"]');
  if (userNameDiv) {
    const textContent = userNameDiv.textContent;
    const match = textContent.match(/@([a-zA-Z0-9_]+)/);
    if (match) return match[1];
  }

  const links = article.querySelectorAll('a[href^="/"]');
  for (let link of links) {
      if (link.getAttribute('href').length > 1 && !link.getAttribute('href').includes('/status/')) {
          return link.getAttribute('href').substring(1);
      }
  }

  const text = article.innerText;
  const match = text.match(/@([a-zA-Z0-9_]+)/);
  if (match) return match[1];

  return null;
}

function applyDynamicFilters() {
  const articles = document.querySelectorAll('article');

  // Reset dynamic count before recounting
  sessionDynamicHiddenCount = 0;

  if (!appSettings.isEnabled) {
      // Restore all dynamic hidden items
      articles.forEach(article => {
          if (article.dataset.linzuDynamicHidden) {
              article.style.display = '';
              delete article.dataset.linzuDynamicHidden;
          }
      });
      updateCounterDisplay();
      return;
  }

  // Determine current profile owner if on a profile page
  let currentProfileOwner = null;

  // Mock support
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

  articles.forEach(article => {
    // If permanently hidden by static rules, skip
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

    // Apply visibility
    if (shouldHide) {
        article.style.display = 'none';
        article.dataset.linzuDynamicHidden = "true";
        sessionDynamicHiddenCount++;
    } else {
        // Only unhide if it was hidden by dynamic filter (has the flag)
        // If it lacks the flag, it might be visible or hidden by other means (shouldn't happen if not linzuHidden)
        if (article.dataset.linzuDynamicHidden) {
            article.style.display = '';
            delete article.dataset.linzuDynamicHidden;
        }
    }
  });

  updateCounterDisplay();
}


// --- Filtering Logic (Permanent) ---

function removeTweet(article, reason) {
  if (article.style.display === 'none') return;

  article.style.display = 'none';
  article.dataset.linzuHidden = "true";

  console.log(`[Linzu Clean] Removed (${reason}):`, article.innerText.substring(0, 30));

  // Update counter
  const newCount = (appSettings.removedCount || 0) + 1;
  chrome.storage.local.set({ removedCount: newCount });
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

function processTweet(article) {
  if (article.dataset.linzuChecked) return;
  article.dataset.linzuChecked = "true";

  const text = article.innerText || "";

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
}

function scanNodes(nodes) {
  nodes.forEach(node => {
    if (node.nodeType === 1) {
      if (node.tagName === 'ARTICLE') {
        processTweet(node);
      } else if (node.querySelectorAll) {
        const articles = node.querySelectorAll('article');
        articles.forEach(processTweet);
      }
    }
  });
  applyDynamicFilters();
}

LinzuI18n.init(() => {
  injectFloatingUI();
});

const observer = new MutationObserver((mutations) => {
  if (!appSettings.isEnabled) return;
  mutations.forEach(mutation => {
    if (mutation.addedNodes.length > 0) {
      scanNodes(mutation.addedNodes);
    }
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Expose for testing
window.setDynamicSettings = function(settings) {
    dynamicSettings = { ...dynamicSettings, ...settings };
    applyDynamicFilters();
};

// Linzu Clean for X - Content Script
console.log('Linzu Clean: Content script loaded');

// State
let appSettings = {
  isEnabled: true,
  removedCount: 0,
  filters: {}, // zombie, spam, toxic
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

// Dynamic State (Session only, not persisted to storage for now, or could be)
let dynamicSettings = {
  ownerOnly: false,
  hideReposts: false,
  focusUser: '' // username string
};

// Expose for testing
window.setDynamicSettings = function(settings) {
    dynamicSettings = { ...dynamicSettings, ...settings };
    applyDynamicFilters();
};

// Seen texts for duplicate detection (TextHash -> Count)
const seenTexts = new Set();


// Helper to update text content of UI elements
function updateUIText() {
  const title = document.querySelector('.linzu-title');
  const statsLabel = document.querySelector('.linzu-stats-label');
  const settingsBtn = document.querySelector('.linzu-settings-btn');
  const ownerLabel = document.querySelector('label[for="linzu-owner"]');
  const repostsLabel = document.querySelector('label[for="linzu-reposts"]');
  const searchInput = document.getElementById('linzu-search');

  if (title) title.textContent = LinzuI18n.t('appTitle');
  if (statsLabel) statsLabel.textContent = LinzuI18n.t('ui_removed');
  if (settingsBtn) settingsBtn.textContent = LinzuI18n.t('ui_settings');

  if (ownerLabel) ownerLabel.lastChild.textContent = LinzuI18n.t('ui_dynamic_owner');
  if (repostsLabel) repostsLabel.lastChild.textContent = LinzuI18n.t('ui_dynamic_reposts');
  if (searchInput) searchInput.placeholder = LinzuI18n.t('ui_dynamic_search');
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
      <label class="linzu-control-item" for="linzu-reposts">
        <input type="checkbox" id="linzu-reposts"> ${LinzuI18n.t('ui_dynamic_reposts')}
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
  const countDisplay = document.getElementById('linzu-count');
  const settingsBtn = document.querySelector('.linzu-settings-btn');

  // Dynamic Control Elements
  const ownerCheckbox = document.getElementById('linzu-owner');
  const repostsCheckbox = document.getElementById('linzu-reposts');
  const searchInput = document.getElementById('linzu-search');

  console.log('Attaching listeners to controls:', { ownerCheckbox, repostsCheckbox, searchInput });

  // Load initial state (Storage)
  loadSettings(() => {
    toggle.checked = appSettings.isEnabled;
    countDisplay.textContent = appSettings.removedCount;
  });

  // Toggle Event Listener
  toggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ isEnabled: isEnabled });
    console.log(`Linzu Clean: ${isEnabled ? 'Enabled' : 'Disabled'}`);

    // If disabled, we might want to show everything again
    if (!isEnabled) {
       applyDynamicFilters();
    } else {
       // Re-apply
       const articles = document.querySelectorAll('article');
       scanNodes(articles); // Re-run all logic
       applyDynamicFilters();
    }
  });

  // Dynamic Controls Listeners
  if (ownerCheckbox) {
    ownerCheckbox.addEventListener('change', (e) => {
      console.log('Owner Checkbox Changed:', e.target.checked);
      dynamicSettings.ownerOnly = e.target.checked;
      applyDynamicFilters();
    });
  } else { console.error('Owner checkbox not found'); }

  if (repostsCheckbox) {
    repostsCheckbox.addEventListener('change', (e) => {
      console.log('Reposts Checkbox Changed:', e.target.checked);
      dynamicSettings.hideReposts = e.target.checked;
      applyDynamicFilters();
    });
  } else { console.error('Reposts checkbox not found'); }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      console.log('Search Input Changed:', e.target.value);
      dynamicSettings.focusUser = e.target.value.trim().replace(/^@/, ''); // Remove @ if typed
      applyDynamicFilters();
    });
  } else { console.error('Search input not found'); }

  // Settings Button Listener
  settingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const optionsUrl = chrome.runtime.getURL('options/options.html');
    window.open(optionsUrl, '_blank');
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      // Update local state
      if (changes.isEnabled) appSettings.isEnabled = changes.isEnabled.newValue;
      if (changes.removedCount) {
        appSettings.removedCount = changes.removedCount.newValue;
        countDisplay.textContent = appSettings.removedCount;
      }
      if (changes.filters) appSettings.filters = changes.filters.newValue;
      if (changes.filterDuplicates) appSettings.filterDuplicates = changes.filterDuplicates.newValue;
      if (changes.filterVerified) appSettings.filterVerified = changes.filterVerified.newValue;
      if (changes.filterLanguage) appSettings.filterLanguage = changes.filterLanguage.newValue;
      if (changes.filterContent) appSettings.filterContent = changes.filterContent.newValue;
      if (changes.customKeywords) appSettings.customKeywords = changes.customKeywords.newValue;

      if (changes.language) {
        // Update language immediately
        LinzuI18n.setLocale(changes.language.newValue, () => {
          updateUIText();
        });
      }

      // Update Toggle UI if changed externally
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
  // Extract handle from article.
  // Strategy: Look for specific elements usually containing handle
  // Often it's in a span that starts with @ inside a User-Name div
  // Or in a link to profile

  // Try to find the user handle text (e.g. @username)
  // X structure varies but usually handle is visible text starting with @
  // Or inside a link with href matching the pattern

  // Mock environment usually simplifies this.
  // Real X environment:
  // <div data-testid="User-Name"> ... <span ...>@handle</span> ... </div>

  const userNameDiv = article.querySelector('[data-testid="User-Name"]');
  if (userNameDiv) {
    const textContent = userNameDiv.textContent;
    // Simple regex to find @handle
    const match = textContent.match(/@([a-zA-Z0-9_]+)/);
    if (match) return match[1];
  }

  // Fallback for mock environment or alternative structure
  // Look for any link that might be a profile link
  // or a span with @
  const links = article.querySelectorAll('a[href^="/"]');
  for (let link of links) {
      if (link.getAttribute('href').length > 1 && !link.getAttribute('href').includes('/status/')) {
          const handle = link.getAttribute('href').substring(1);
          return handle;
      }
  }

  // Mock fallback: look for text starting with @
  const text = article.innerText;
  const match = text.match(/@([a-zA-Z0-9_]+)/);
  if (match) return match[1];

  return null;
}

function isRepost(article) {
  // Check for social context indicating repost
  const socialContext = article.querySelector('[data-testid="socialContext"]');
  if (socialContext) {
    const text = socialContext.innerText.toLowerCase();
    if (text.includes('reposted') || text.includes('リポスト')) {
      return true;
    }
  }

  // Also check for SVG icon that looks like repost (path check is hard, rely on text or specific svg class)
  // In mock we can use a class or attribute
  if (article.dataset.isRepost === "true") return true;

  // Verify mocked repost attribute more robustly for testing
  if (article.getAttribute('data-is-repost') === 'true') return true;

  return false;
}

function applyDynamicFilters() {
  if (!appSettings.isEnabled) {
      console.log('Skipping dynamic filters: disabled');
      return;
  }

  const articles = document.querySelectorAll('article');
  console.log(`Applying Dynamic Filters to ${articles.length} articles. Settings:`, dynamicSettings);

  // Determine current profile owner if on a profile page
  let currentProfileOwner = null;
  const pathParts = window.location.pathname.split('/');
  if (pathParts.length >= 2 && pathParts[1]) {
      // Assuming first part is user
      // Exclude common non-user paths
      const nonUserPaths = ['home', 'explore', 'notifications', 'messages', 'search', 'settings'];
      if (!nonUserPaths.includes(pathParts[1])) {
          currentProfileOwner = pathParts[1];
      }
  }

  articles.forEach(article => {
    // If permanently hidden by static rules, skip (keep hidden)
    if (article.dataset.linzuHidden === "true") return;

    let shouldHide = false;
    const username = getUsername(article);

    // 1. Owner Only
    if (dynamicSettings.ownerOnly && currentProfileOwner) {
        if (username !== currentProfileOwner) {
            shouldHide = true;
        }
    }

    // 2. Hide Reposts
    if (!shouldHide && dynamicSettings.hideReposts) {
        if (isRepost(article)) {
            shouldHide = true;
        }
    }

    // 3. Focus User
    if (!shouldHide && dynamicSettings.focusUser) {
        if (username !== dynamicSettings.focusUser) {
            shouldHide = true;
        }
    }

    // Apply visibility
    if (shouldHide) {
        article.style.display = 'none';
        article.dataset.linzuDynamicHidden = "true";
    } else {
        article.style.display = ''; // Restore to default (block/flex)
        delete article.dataset.linzuDynamicHidden;
    }
  });
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
  if (!text || text.length < 5) return false; // Ignore very short texts for duplication check

  // Simple hash or just use the text string if not too long
  // For safety against huge strings, maybe truncate
  const key = text.trim();

  if (seenTexts.has(key)) {
    return true; // Already seen -> hide
  }
  seenTexts.add(key); // First time -> keep
  return false;
}

// 2. Language Check
function checkLanguage(article) {
  if (appSettings.filterLanguage === 'all') return false; // Allowed

  // X usually puts lang attribute on a div inside the article
  const langDiv = article.querySelector('div[lang]');
  if (!langDiv) return false; // Can't determine, so keep it safe

  const lang = langDiv.getAttribute('lang');

  if (appSettings.filterLanguage === 'ja') {
    return lang !== 'ja'; // Remove if not JA
  }
  if (appSettings.filterLanguage === 'en') {
    return lang !== 'en'; // Remove if not EN
  }
  return false;
}

// 3. Content Check
function checkContent(article, text) {
  // Image/Video Only
  if (appSettings.filterContent?.imageOnly) {
     // If text is empty but has media
     const hasMedia = article.querySelector('div[data-testid="tweetPhoto"]') || article.querySelector('div[data-testid="videoPlayer"]');
     if (!text.trim() && hasMedia) return true; // Remove
  }

  // Short Post
  if (appSettings.filterContent?.shortPost) {
    if (text.trim().length > 0 && text.trim().length <= 5) return true;
  }

  // Excessive Links/Tags
  if (appSettings.filterContent?.excessiveLinks) {
     const links = (text.match(/https?:\/\//g) || []).length;
     const tags = (text.match(/#/g) || []).length;
     if (links + tags >= 5) return true; // Threshold 5
  }

  return false;
}

// 4. Verified Account Check
function checkVerified(article) {
  if (!appSettings.filterVerified) return false;

  // X uses various icons. Verified is usually an SVG with specific aria-label or data-testid
  // data-testid="icon-verified" is common
  const verifiedIcon = article.querySelector('svg[data-testid="icon-verified"]');
  if (verifiedIcon) return true;

  // Fallback check for aria-label
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

// 6. Legacy Keywords
function checkLegacyKeywords(text) {
  const keywords = ['稼げる', 'spampromotion', 'zombietest', 'プロモーション'];
  return keywords.some(keyword => text.includes(keyword));
}

function processTweet(article) {
  if (article.dataset.linzuChecked) return;
  article.dataset.linzuChecked = "true";

  const text = article.innerText || "";

  // Order of checks:

  // 1. Language
  if (checkLanguage(article)) {
    removeTweet(article, 'Language Filter');
    return;
  }

  // 2. Duplicates
  if (checkDuplicate(text)) {
    removeTweet(article, 'Duplicate');
    return;
  }

  // 3. Verified Accounts
  if (checkVerified(article)) {
    removeTweet(article, 'Verified Account');
    return;
  }

  // 4. Content
  if (checkContent(article, text)) {
    removeTweet(article, 'Content Restriction');
    return;
  }

  // 5. Custom Keywords
  if (checkCustomKeywords(text)) {
    removeTweet(article, 'Custom Keyword');
    return;
  }

  // 6. Legacy Keywords (if zombie filter enabled)
  if (appSettings.filters?.zombie && checkLegacyKeywords(text)) {
    removeTweet(article, 'Zombie/Spam Keyword');
    return;
  }
}

function scanNodes(nodes) {
  nodes.forEach(node => {
    if (node.nodeType === 1) { // Element
      if (node.tagName === 'ARTICLE') {
        processTweet(node);
      } else if (node.querySelectorAll) {
        const articles = node.querySelectorAll('article');
        articles.forEach(processTweet);
      }
    }
  });

  // Apply dynamic filters after processing new nodes
  applyDynamicFilters();
}

// Initialize I18n then inject UI
LinzuI18n.init(() => {
  injectFloatingUI();
});

// Mutation Observer Setup
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

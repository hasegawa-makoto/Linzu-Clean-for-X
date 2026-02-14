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

// Seen texts for duplicate detection (TextHash -> Count)
const seenTexts = new Set();


// Helper to update text content of UI elements
function updateUIText() {
  const title = document.querySelector('.linzu-title');
  const statsLabel = document.querySelector('.linzu-stats-label');
  const settingsBtn = document.querySelector('.linzu-settings-btn');

  if (title) title.textContent = LinzuI18n.t('appTitle');
  if (statsLabel) statsLabel.textContent = LinzuI18n.t('ui_removed');
  if (settingsBtn) settingsBtn.textContent = LinzuI18n.t('ui_settings');
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
    <div class="linzu-stats">
      <span class="linzu-stats-label">${LinzuI18n.t('ui_removed')}</span> <span id="linzu-count">0</span>
    </div>
    <div class="linzu-footer" style="margin-top: 5px; text-align: right;">
        <a href="#" class="linzu-settings-btn" style="color: #1da1f2; font-size: 11px; text-decoration: none;">${LinzuI18n.t('ui_settings')}</a>
    </div>
  `;
  document.body.appendChild(uiContainer);

  const toggle = document.getElementById('linzu-toggle');
  const countDisplay = document.getElementById('linzu-count');
  const settingsBtn = document.querySelector('.linzu-settings-btn');

  // Load initial state
  loadSettings(() => {
    toggle.checked = appSettings.isEnabled;
    countDisplay.textContent = appSettings.removedCount;
  });

  // Toggle Event Listener
  toggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ isEnabled: isEnabled });
    console.log(`Linzu Clean: ${isEnabled ? 'Enabled' : 'Disabled'}`);
  });

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

// --- Filtering Logic ---

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

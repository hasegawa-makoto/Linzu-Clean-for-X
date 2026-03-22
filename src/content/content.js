// Linzu Clean for X - Content Script

// Safety: Wrap everything in a try-catch to prevent crashing the page
try {

// --- Constants & Regex (Pre-compiled) ---
const REGEX_USER_HANDLE = /@([a-zA-Z0-9_]+)/;
const REGEX_STATUS_ID = /\/status\/(\d+)/;
const REGEX_DIGITS_5 = /\d{5,}$/;
const REGEX_LINKS = /https?:\/\//g;
const REGEX_EXTERNAL_LINKS = /https?:\/\/(?!x\.com|twitter\.com)/;
const REGEX_HASHTAGS = /#/g;

// --- State ---
let appSettings = {
  isEnabled: true,
  removedCount: 0,
  isMinimized: false,
  // New split duplicate settings
  filterDuplicateContent: true,
  filterUserSpam: true,

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
  customKeywords: [],
  licenseStatus: 'inactive' // 'active' or 'inactive'
};

// Dynamic State (Session only)
let dynamicSettings = {
  ownerOnly: false,
  focusUser: ''
};

// Counters (Session Only)
let localRemovedCount = 0; // Legacy counter

// URL Tracking for reset
let lastUrl = location.href;

// Observer instance
let observer = null;

// Duplicate Detection: Map<TextHash, Set<StatusID>>
const seenContent = new Map();
const MAX_CACHE_SIZE = 500;

// Global Permitted/Hidden Status tracking for virtual scrolling
const permittedStatusIds = new Set();
const hiddenStatusIds = new Set();

// Thread OP Tracking
let currentThreadOP = null;

// Global session tracking for thread-specific duplicate filtering
const mainListSeenUsers = new Map();

// Debounce Timer for Dynamic Filters
let dynamicFilterTimeout = null;


// --- UI Helpers ---

function updateUIText() {
  try {
    const title = document.querySelector('.linzu-title');
    const statsLabel = document.querySelector('.linzu-stats-label');
    const settingsBtn = document.querySelector('.linzu-settings-btn');
    const hideBtn = document.getElementById('linzu-hide-panel');
    const ownerLabel = document.querySelector('label[for="linzu-owner"]');
    const searchInput = document.getElementById('linzu-search');

    // License Warning
    const licenseWarning = document.getElementById('linzu-license-warning');
    if (licenseWarning) {
        if (appSettings.licenseStatus === 'active') {
            licenseWarning.style.display = 'none';
        } else {
            licenseWarning.style.display = 'block';
            licenseWarning.textContent = LinzuI18n.t('ui_license_required');
        }
    }

    if (title) title.textContent = LinzuI18n.t('appTitle');
    if (statsLabel) statsLabel.textContent = LinzuI18n.t('ui_removed');
    if (settingsBtn) settingsBtn.textContent = LinzuI18n.t('ui_settings');
    if (hideBtn) hideBtn.textContent = LinzuI18n.t('ui_hide_panel');

    if (ownerLabel) ownerLabel.lastChild.textContent = LinzuI18n.t('ui_dynamic_owner');
    if (searchInput) searchInput.placeholder = LinzuI18n.t('ui_dynamic_search');
  } catch (e) {
    // Silent fail
  }
}

function updateCounterDisplay() {
  try {
    const countDisplay = document.getElementById('linzu-count');
    if (countDisplay) {
      // Calculate active hidden nodes based on data attributes
      const hiddenBase = document.querySelectorAll('article[data-linzu-hidden="true"]').length;
      const hiddenDynamic = document.querySelectorAll('article[data-linzu-dynamic-hidden="true"]').length;
      const hiddenSpam = document.querySelectorAll('article[data-linzu-spam-hidden="true"]').length;
      countDisplay.textContent = hiddenBase + hiddenDynamic + hiddenSpam;
    }
  } catch (e) {
    // Silent fail
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

      <div id="linzu-license-warning" style="display:none; color:red; font-size:10px; margin-bottom:5px; text-align:center;">
          ${LinzuI18n.t('ui_license_required')}
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

    if (!document.body) return;

    document.body.appendChild(uiContainer);

    const toggle = document.getElementById('linzu-toggle');
    const ownerCheckbox = document.getElementById('linzu-owner');
    const searchInput = document.getElementById('linzu-search');
    const settingsBtn = document.querySelector('.linzu-settings-btn');
    const hideBtn = document.getElementById('linzu-hide-panel');

    // Load initial state
    loadSettings(() => {
      toggle.checked = appSettings.isEnabled;
      if (appSettings.isMinimized) {
          uiContainer.classList.add('linzu-minimized');
      }
      updateUIText(); // Check license display
      updateCounterDisplay();
    });

    // Toggle
    toggle.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      chrome.storage.local.set({ isEnabled: isEnabled });

      if (!isEnabled) {
         if (observer) observer.disconnect();
         restoreAllVisibility();
         resetSession();
         chrome.storage.local.set({ removedCount: 0 });
      } else {
         startObserver();
         const articles = document.querySelectorAll('article[data-testid="tweet"]');
         scanNodes(articles);
      }
    });

    // UI Controls
    hideBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        appSettings.isMinimized = true;
        uiContainer.classList.add('linzu-minimized');
        chrome.storage.local.set({ isMinimized: true });
    });

    uiContainer.addEventListener('click', (e) => {
        if (uiContainer.classList.contains('linzu-minimized')) {
            appSettings.isMinimized = false;
            uiContainer.classList.remove('linzu-minimized');
            chrome.storage.local.set({ isMinimized: false });
        }
    });

    const interactiveElements = uiContainer.querySelectorAll('input, button, a, label');
    interactiveElements.forEach(el => {
        el.addEventListener('click', (e) => e.stopPropagation());
    });

    // Dynamic settings
    if (ownerCheckbox) {
      ownerCheckbox.addEventListener('change', (e) => {
        dynamicSettings.ownerOnly = e.target.checked;
        scheduleDynamicFilters();
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        dynamicSettings.focusUser = e.target.value.trim().replace(/^@/, '');
        scheduleDynamicFilters();
      });
    }

    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        chrome.runtime.sendMessage({ action: 'openOptions' });
      } catch(err) {}
    });

    // Storage Listener
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.isEnabled) appSettings.isEnabled = changes.isEnabled.newValue;
        if (changes.licenseStatus) {
             appSettings.licenseStatus = changes.licenseStatus.newValue;
             updateUIText(); // Update warning visibility

             // If license state changed, we need to reset/re-scan to apply new rules (or stop applying)
             // Clear processed flags to allow re-evaluation
             restoreAllVisibility();
             if (appSettings.isEnabled) {
                 const articles = document.querySelectorAll('article[data-testid="tweet"]');
                 scanNodes(articles);
             }
        }
        if (changes.isMinimized) {
            appSettings.isMinimized = changes.isMinimized.newValue;
            if (appSettings.isMinimized) uiContainer.classList.add('linzu-minimized');
            else uiContainer.classList.remove('linzu-minimized');
        }
        if (changes.removedCount) {
          appSettings.removedCount = changes.removedCount.newValue;
          updateCounterDisplay();
        }
        // Update local state for other settings
        if (changes.filterDuplicateContent !== undefined) appSettings.filterDuplicateContent = changes.filterDuplicateContent.newValue;
        if (changes.filterUserSpam !== undefined) appSettings.filterUserSpam = changes.filterUserSpam.newValue;

        if (changes.filterUnverified) appSettings.filterUnverified = changes.filterUnverified.newValue;
        if (changes.filterLanguage) appSettings.filterLanguage = changes.filterLanguage.newValue;
        if (changes.filterContent) appSettings.filterContent = changes.filterContent.newValue;
        if (changes.filterBot) appSettings.filterBot = changes.filterBot.newValue;
        if (changes.customKeywords) appSettings.customKeywords = changes.customKeywords.newValue;

        if (changes.language) {
          LinzuI18n.setLocale(changes.language.newValue, () => updateUIText());
        }
        if (changes.isEnabled) {
          toggle.checked = changes.isEnabled.newValue;
        }
      }
    });
  } catch (e) {}
}

function loadSettings(callback) {
  chrome.storage.local.get(null, (result) => {
    appSettings = { ...appSettings, ...result };
    // Backward compatibility if older version data exists
    if (result.filterDuplicateContent === undefined && result.filterDuplicates !== undefined) {
        appSettings.filterDuplicateContent = result.filterDuplicates;
        appSettings.filterUserSpam = result.filterDuplicates;
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
      const match = textContent.match(REGEX_USER_HANDLE);
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
    const match = text.match(REGEX_USER_HANDLE);
    if (match) return match[1];
  } catch (e) {}
  return null;
}

function getStatusId(article) {
    try {
        const links = article.querySelectorAll('a[href*="/status/"]');
        for (let link of links) {
            const href = link.getAttribute('href');
            const match = href.match(REGEX_STATUS_ID);
            if (match) return match[1];
        }
    } catch(e) {}
    return null;
}

function getCurrentProfileOwner() {
    try {
        if (document.body.dataset.linzuMockOwner) {
            return document.body.dataset.linzuMockOwner;
        }
        const pathParts = window.location.pathname.split('/');
        if (pathParts.length >= 2 && pathParts[1]) {
            const nonUserPaths = ['home', 'explore', 'notifications', 'messages', 'search', 'settings'];
            if (!nonUserPaths.includes(pathParts[1])) {
                return pathParts[1];
            }
        }
    } catch(e) {}
    return null;
}

function scheduleDynamicFilters() {
    if (dynamicFilterTimeout) clearTimeout(dynamicFilterTimeout);
    dynamicFilterTimeout = setTimeout(applyDynamicFilters, 100);
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

    // License Check for Dynamic Filters
    if (appSettings.licenseStatus !== 'active') {
         return;
    }

    const currentProfileOwner = getCurrentProfileOwner();
    const hasOwnerFilter = dynamicSettings.ownerOnly && currentProfileOwner;
    const hasFocusFilter = !!dynamicSettings.focusUser;

    // Optimization: Skip loop if no dynamic filters active
    if (!hasOwnerFilter && !hasFocusFilter) {
         articles.forEach(article => {
            if (article.dataset.linzuDynamicHidden) {
                article.style.display = '';
                delete article.dataset.linzuDynamicHidden;
            }
        });
        updateCounterDisplay();
        return;
    }

    articles.forEach(article => {
      // Don't re-hide already permanently hidden tweets
      if (article.dataset.linzuHidden === "true") return;

      let shouldHide = false;
      const username = getUsername(article);

      if (hasOwnerFilter) {
          if (username !== currentProfileOwner) shouldHide = true;
      }
      if (!shouldHide && hasFocusFilter) {
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

    applyThreadUserSpamFilter();
  } catch (e) {}
}


// --- State Helpers ---

function pruneSet(setInstance) {
    if (setInstance.size > MAX_CACHE_SIZE) {
        // Remove oldest half to free up memory while retaining recent
        const arr = Array.from(setInstance);
        const toKeep = arr.slice(Math.floor(MAX_CACHE_SIZE / 2));
        setInstance.clear();
        toKeep.forEach(item => setInstance.add(item));
    }
}

function markPermitted(statusId) {
    if (statusId) {
        permittedStatusIds.add(statusId);
        pruneSet(permittedStatusIds);
    }
}

function extractRepliedToUsers(article) {
    const textEls = article.querySelectorAll('[data-testid="tweetText"]');
    const mentions = new Set();

    const replyingToEl = article.querySelector('div.r-1d09ksm.r-1471scf.r-1c6vphq, a.r-1wbh5a2.r-dnmrzs.r-1ny4l3l.r-1loqt21');
    if (replyingToEl && replyingToEl.innerText.includes('@')) {
        const matches = replyingToEl.innerText.match(/@([\w_]+)/g);
        if (matches) {
            matches.forEach(m => mentions.add(m.substring(1).toLowerCase()));
        }
    }

    textEls.forEach(el => {
        const links = el.querySelectorAll('a[role="link"]');
        links.forEach(link => {
            if (link.innerText.startsWith('@')) {
                mentions.add(link.innerText.substring(1).toLowerCase());
            } else {
                const srText = link.innerText.match(/@([\w_]+)/);
                if (srText) mentions.add(srText[1].toLowerCase());
            }
        });

        const textMentions = el.innerText.match(/@([\w_]+)/g);
        if (textMentions) {
            textMentions.forEach(m => mentions.add(m.substring(1).toLowerCase()));
        }
    });

    return mentions;
}

// --- Filtering Logic (Permanent) ---

function applyThreadUserSpamFilter() {
    try {
        if (!appSettings.isEnabled || !appSettings.filterUserSpam || appSettings.licenseStatus !== 'active') return;

        const path = window.LINZU_MOCK_PATH || document.body.dataset.linzuMockPath || location.pathname;
        if (!path.includes('/status/')) return;

        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        let lastVisibleUser = null;

        for (const article of articles) {
            // 既に非表示（別フィルター）ならスキップ
            if (article.style.display === 'none' && !article.dataset.linzuSpamHidden) continue;

            // 未処理ならスキップ
            if (!article.dataset.linzuProcessed) continue;

            const handle = getUsername(article);
            if (!handle) continue;

            const lowerHandle = handle.toLowerCase();
            const statusId = getStatusId(article);

            // 【最優先：ルール1】投稿主(A)の保護
            // スレッドの親は、過去に何度登場していようが、何番目であろうが、必ず「表示」する絶対聖域
            if (currentThreadOP && lowerHandle === currentThreadOP.toLowerCase()) {
                if (article.dataset.linzuSpamHidden) {
                    article.style.display = '';
                    delete article.dataset.linzuSpamHidden;
                }

                // 後続の会話チェーンの基準となるよう記録に追加
                if (!mainListSeenUsers.has(lowerHandle)) {
                    mainListSeenUsers.set(lowerHandle, new Set());
                }
                if (statusId) mainListSeenUsers.get(lowerHandle).add(statusId);

                lastVisibleUser = lowerHandle;
                continue; // これ以降のルールを無視
            }

            // すでに表示したことがあるか（ルール2・ルール3への分岐）
            if (mainListSeenUsers.has(lowerHandle)) {
                // 仮想スクロール対策：全く同じツイート（StatusIDが同一）が再描画された場合はそのまま表示を継続
                if (statusId && mainListSeenUsers.get(lowerHandle).has(statusId)) {
                    if (article.dataset.linzuSpamHidden) {
                        article.style.display = '';
                        delete article.dataset.linzuSpamHidden;
                    }
                    lastVisibleUser = lowerHandle;
                    continue;
                }

                // 【ルール2：会話の継続】
                // 直前の表示されている投稿者に対する直接の返信である場合は、会話として表示する
                const repliedUsers = extractRepliedToUsers(article);
                const isConversation = lastVisibleUser && lastVisibleUser !== lowerHandle && repliedUsers.has(lastVisibleUser);

                if (isConversation) {
                    if (article.dataset.linzuSpamHidden) {
                        article.style.display = '';
                        delete article.dataset.linzuSpamHidden;
                    }
                    if (statusId) mainListSeenUsers.get(lowerHandle).add(statusId);
                    lastVisibleUser = lowerHandle;
                    continue; // これ以降のルールを無視
                }

                // 【ルール3：重複の排除】
                // ルール1にもルール2にも当てはまらない、脈絡のない2回目以降の登場は非表示にする
                article.style.display = 'none';
                article.dataset.linzuSpamHidden = 'true';
                continue; // 非表示にしたので lastVisibleUser は更新しない
            } else {
                // 初登場：表示を許可し、IDとStatusIDをリストに追加
                if (article.dataset.linzuSpamHidden) {
                    article.style.display = '';
                    delete article.dataset.linzuSpamHidden;
                }
                mainListSeenUsers.set(lowerHandle, new Set());
                if (statusId) mainListSeenUsers.get(lowerHandle).add(statusId);

                lastVisibleUser = lowerHandle;
            }
        }
        updateCounterDisplay();
    } catch (e) {}
}


function removeTweet(article) {
  if (article.style.display === 'none' || article.dataset.linzuHidden === "true") return;

  article.style.display = 'none';
  article.dataset.linzuHidden = "true";

  localRemovedCount++;
  updateCounterDisplay();
}

// 1. Content Duplicate Check
function checkContentDuplicate(text, statusId) {
  if (!text || text.length < 5) return false;
  if (!statusId) return false;

  const contentKey = text.trim();

  // Is this content already mapped to a DIFFERENT status ID?
  // If mapped to the SAME status ID, it's just the exact same tweet re-rendered.
  if (seenContent.has(contentKey)) {
      const existingStatusId = seenContent.get(contentKey);
      if (existingStatusId !== statusId) {
          return true; // Different tweet, same content -> duplicate
      }
  }

  // Memory Management: Prune Map if too large
  if (seenContent.size > MAX_CACHE_SIZE) {
      const arr = Array.from(seenContent.entries());
      const toKeep = arr.slice(Math.floor(MAX_CACHE_SIZE / 2));
      seenContent.clear();
      toKeep.forEach(([k, v]) => seenContent.set(k, v));
  }

  seenContent.set(contentKey, statusId);
  return false;
}

// 3. Language Check
function checkLanguage(article) {
  const langDiv = article.querySelector('div[lang]');
  if (!langDiv) return false;
  const lang = langDiv.getAttribute('lang');

  if (appSettings.filterLanguage === 'ja') return lang !== 'ja';
  if (appSettings.filterLanguage === 'en') return lang !== 'en';
  return false;
}

// 4. Content Check
function checkContent(article, text, handle) {
  const isOP = currentThreadOP && handle === currentThreadOP;

  if (appSettings.filterContent?.imageOnly) {
     if (!isOP) {
         const hasTextDiv = article.querySelector('div[data-testid="tweetText"]');
         const hasMedia = article.querySelector('div[data-testid="tweetPhoto"]') || article.querySelector('div[data-testid="videoPlayer"]');

         if (!hasTextDiv && hasMedia) return true;
         if (hasTextDiv && !hasTextDiv.innerText.trim() && hasMedia) return true;
     }
  }
  if (appSettings.filterContent?.shortPost) {
    const hasTextDiv = article.querySelector('div[data-testid="tweetText"]');
    if (hasTextDiv && text.trim().length > 0 && text.trim().length <= 5) return true;
  }
  if (appSettings.filterContent?.excessiveLinks) {
     const links = (text.match(REGEX_LINKS) || []).length;
     const tags = (text.match(REGEX_HASHTAGS) || []).length;
     if (links + tags >= 5) return true;
  }
  return false;
}

// 5. Verified Account Check
function checkUnverified(article) {
  const userNameDiv = article.querySelector('[data-testid="User-Name"]');
  if (!userNameDiv) return false;
  const verifiedIcon = userNameDiv.querySelector('svg[data-testid="icon-verified"]');
  if (!verifiedIcon) return true;
  return false;
}

// 6. Custom Keywords
function checkCustomKeywords(text) {
  for (const keyword of appSettings.customKeywords) {
    if (text.includes(keyword)) return true;
  }
  return false;
}

// 7. Bot Detection
function checkBotDigits(handle) {
    if (!handle) return false;
    if (REGEX_DIGITS_5.test(handle)) return true;
    return false;
}

function checkBotDefaultIcon(article) {
    const userAvatar = article.querySelector('div[data-testid="Tweet-User-Avatar"] img');
    if (userAvatar) {
        const src = userAvatar.getAttribute('src') || "";
        if (src.includes('default_profile_images')) return true;
    }
    return false;
}

function checkBotEmoji(article) {
    const tweetTextNode = article.querySelector('div[data-testid="tweetText"]');
    const contentText = tweetTextNode ? tweetTextNode.innerText.trim() : "";
    if (tweetTextNode) {
        if (contentText.length > 0 && contentText.length <= 3) return true;
    }
    return false;
}

function checkBotLinks(article) {
    const tweetTextNode = article.querySelector('div[data-testid="tweetText"]');
    const contentText = tweetTextNode ? tweetTextNode.innerText : article.innerText;
    if (contentText.match(REGEX_EXTERNAL_LINKS)) return true;
    return false;
}


function processTweet(article) {
  try {
    // 1. Already Processed? (Early Exit)
    if (article.dataset.linzuProcessed) return;
    article.dataset.linzuProcessed = "true";

    // License Gate (Strict Mode)
    // If not active, skip ALL filtering
    if (appSettings.licenseStatus !== 'active') return;

    const handle = getUsername(article);
    const statusId = getStatusId(article);

    // --- Virtual Scroll Absolute Protection ---
    // If we've already permitted this exact status ID in this session, skip ALL checks
    if (statusId && permittedStatusIds.has(statusId)) {
        if (article.style.display === 'none') article.style.display = '';
        markPermitted(statusId);
        return;
    }

    // If we've already hidden this exact status ID, hide it silently
    if (statusId && hiddenStatusIds.has(statusId)) {
        removeTweet(article);
        return;
    }

    // 2. Absolute Privilege (Owner)
    const currentProfileOwner = getCurrentProfileOwner();
    if (currentProfileOwner && handle === currentProfileOwner) {
        markPermitted(statusId);
        return;
    }

    // Pre-calculations
    const tweetTextNode = article.querySelector('div[data-testid="tweetText"]');
    const contentText = tweetTextNode ? tweetTextNode.innerText : (article.innerText || "");

    const path = window.LINZU_MOCK_PATH || document.body.dataset.linzuMockPath || location.pathname;

    // Identify OP (Thread view)
    // In deep links, the top-most main tweet becomes the new OP.
    const urlStatusIdMatch = path.match(REGEX_STATUS_ID);
    if (urlStatusIdMatch && urlStatusIdMatch[1]) {
        if (urlStatusIdMatch[1] === statusId) {
            // Found the OP of the current page!
            currentThreadOP = handle;
            markPermitted(statusId);
            return;
        }
    }

    // Filter Checks (Strict Gating)
    const runFilters = () => {
        if (appSettings.filterBot?.digits && checkBotDigits(handle)) return true;
        if (appSettings.filterBot?.defaultIcon && checkBotDefaultIcon(article)) return true;
        if (appSettings.filterBot?.emoji && checkBotEmoji(article)) return true;
        if (appSettings.filterBot?.links && checkBotLinks(article)) return true;

        if (appSettings.filterLanguage !== 'all' && checkLanguage(article)) return true;

        // Split Duplicate Checks
        if (appSettings.filterDuplicateContent && checkContentDuplicate(contentText, statusId)) return true;

        if (appSettings.filterUnverified && checkUnverified(article)) return true;

        if (appSettings.filterContent && (appSettings.filterContent.imageOnly || appSettings.filterContent.shortPost || appSettings.filterContent.excessiveLinks)) {
            if (checkContent(article, contentText, handle)) return true;
        }

        if (appSettings.customKeywords?.length > 0 && checkCustomKeywords(contentText)) return true;

        return false;
    };

    if (runFilters()) {
        if (statusId) {
            hiddenStatusIds.add(statusId);
            pruneSet(hiddenStatusIds);
        }
        removeTweet(article);
    } else {
        markPermitted(statusId);
    }

  } catch (e) {}
}

function scanNodes(nodes) {
  try {
    // Optimized loop
    for (const node of nodes) {
        if (node.nodeType !== 1) continue;
        if (node.id === 'linzu-floating-ui' || node.classList.contains('linzu-ignore')) continue;

        if (node.tagName === 'ARTICLE' && node.getAttribute('data-testid') === 'tweet') {
            processTweet(node);
        } else if (node.querySelectorAll) {
            const articles = node.querySelectorAll('article[data-testid="tweet"]');
            for (const article of articles) {
                processTweet(article);
            }
        }
    }
    scheduleDynamicFilters();
  } catch (e) {}
}

function resetSession() {
    localRemovedCount = 0; // Legacy
    seenContent.clear();
    permittedStatusIds.clear();
    hiddenStatusIds.clear();
    currentThreadOP = null;
    lastUrl = location.href;
    updateCounterDisplay();
}

function restoreAllVisibility() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    articles.forEach(article => {
        if (article.style.display === 'none') article.style.display = '';
        delete article.dataset.linzuHidden;
        delete article.dataset.linzuDynamicHidden;
        delete article.dataset.linzuProcessed;
        delete article.dataset.linzuChecked;
        delete article.dataset.linzuSpamHidden;
    });
    // When resetting visibility (e.g., toggle OFF/ON), clear tracking for fair re-eval
    seenContent.clear();
    permittedStatusIds.clear();
    hiddenStatusIds.clear();
    currentThreadOP = null;

    updateCounterDisplay();
}

LinzuI18n.init(() => {
  loadSettings(() => {
      injectFloatingUI();
      startObserver();

      // ユーザー要望による0.5秒間隔の物理的な重複排除スキャン
      setInterval(applyThreadUserSpamFilter, 500);

      const existingArticles = document.querySelectorAll('article[data-testid="tweet"]');
      if (existingArticles.length > 0) {
          scanNodes(existingArticles);
      }
  });
});

let isRealNavigation = false;

window.addEventListener('popstate', () => {
    isRealNavigation = true;
    setTimeout(() => isRealNavigation = false, 2000);
});

document.addEventListener('click', () => {
    isRealNavigation = true;
    setTimeout(() => isRealNavigation = false, 2000);
});

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    if (!appSettings.isEnabled) return;

    if (location.href !== lastUrl) {
        if (isRealNavigation) {
            mainListSeenUsers.clear();
            isRealNavigation = false; // consume
        }

        resetSession();
        // SPA Full Re-evaluation
        // Ensure all tweets on the newly rendered page are properly processed
        restoreAllVisibility();
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        scanNodes(articles);
    }

    const addedNodes = [];
    for (const mutation of mutations) {
       if (mutation.target.id === 'linzu-floating-ui' || mutation.target.closest('#linzu-floating-ui')) continue;
       if (mutation.addedNodes.length > 0) {
           for (const node of mutation.addedNodes) {
               addedNodes.push(node);
           }
       }
    }

    if (addedNodes.length > 0) {
      scanNodes(addedNodes);
    }
  });

  if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
  }

  // 3. Delayed rescan on generic button clicks (e.g. "Show replies", "Show more replies")
  // Using generic role="button" to be language-independent
  document.addEventListener('click', (e) => {
      const btn = e.target.closest('[role="button"], [data-testid="cellInnerDiv"]');
      if (btn) {
          setTimeout(() => {
              if (appSettings.isEnabled) scheduleDynamicFilters();
          }, 200);
      }
  });
}

// Expose for testing
window.setDynamicSettings = function(settings) {
    dynamicSettings = { ...dynamicSettings, ...settings };
    scheduleDynamicFilters();
};

window.mockNavigation = function(newUrl) {
    history.pushState({}, "", newUrl);
};

} catch (globalError) {}

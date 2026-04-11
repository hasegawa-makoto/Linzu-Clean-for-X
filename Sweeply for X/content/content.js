// Sweeply for X - Content Script

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
let currentThreadBaseStatusId = (() => {
    const match = location.pathname.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
})();

// Global session tracking for thread-specific duplicate filtering
const mainListSeenUsers = new Map();
const opInteractedUsers = new Set();

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

    // License Logic for Floating UI
    const licenseWrapper = document.getElementById('linzu-license-wrapper');
    const mainControls = document.getElementById('linzu-main-controls');
    const licenseStatusLabel = document.getElementById('linzu-license-status-label');

    // License UI Texts
    const licenseReqTitle = document.getElementById('linzu-license-req-title');
    const activateBtn = document.getElementById('linzu-activate-btn');
    const licenseError = document.getElementById('linzu-license-error');
    const getLicenseLink = document.getElementById('linzu-get-license-link');
    const tokushohoLink = document.getElementById('linzu-tokushoho-link');

    if (licenseReqTitle) licenseReqTitle.textContent = LinzuI18n.t('ui_license_req_title');
    if (activateBtn) activateBtn.textContent = LinzuI18n.t('ui_activate_btn');
    if (licenseError && licenseError.style.display === 'block') licenseError.textContent = LinzuI18n.t('ui_invalid_key');
    if (tokushohoLink) tokushohoLink.textContent = LinzuI18n.t('ui_tokushoho');

    if (getLicenseLink) {
        getLicenseLink.textContent = LinzuI18n.t('ui_get_license');
        const lang = navigator.language || navigator.userLanguage || '';
        if (lang.includes('ja')) {
            getLicenseLink.href = 'https://buy.stripe.com/cNi3cv7txa1U1Pn8ZEaEE00';
        } else {
            getLicenseLink.href = 'https://buy.stripe.com/28E28r5lpgqi2TrdfUaEE01';
        }
    }

    if (licenseWrapper && mainControls && licenseStatusLabel) {
        // Also respect minimized state to prevent layout breaking
        const uiContainer = document.getElementById('linzu-floating-ui');
        const isMinimized = uiContainer && uiContainer.classList.contains('linzu-minimized');

        if (appSettings.licenseStatus === 'active') {
            licenseWrapper.style.display = 'none';
            mainControls.style.display = isMinimized ? 'none' : 'block';
            licenseStatusLabel.style.display = isMinimized ? 'none' : 'block';
        } else {
            licenseWrapper.style.display = isMinimized ? 'none' : 'block';
            mainControls.style.display = 'none';
            licenseStatusLabel.style.display = 'none';
        }
    }

    if (title) title.textContent = LinzuI18n.t('appShortName');
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
        <span class="linzu-title">${LinzuI18n.t('appShortName')}</span>
        <label class="linzu-switch">
          <input type="checkbox" id="linzu-toggle">
          <span class="linzu-slider round"></span>
        </label>
      </div>

      <div id="linzu-license-status-label" style="display:none; font-size:10px; color:green; text-align:center; margin-bottom: 5px;">
        Pro License: Active
      </div>

      <div id="linzu-license-wrapper" style="display:none; text-align:center; padding: 10px;">
          <div id="linzu-license-req-title" style="color:red; font-size:12px; margin-bottom:8px; font-weight:bold;">${LinzuI18n.t('ui_license_req_title')}</div>
          <input type="text" id="linzu-license-input" placeholder="License Key" style="width:90%; padding:5px; margin-bottom:5px; box-sizing:border-box;">
          <button id="linzu-activate-btn" style="width:90%; padding:5px; background:#1DA1F2; color:white; border:none; border-radius:4px; cursor:pointer;">${LinzuI18n.t('ui_activate_btn')}</button>
          <div id="linzu-license-error" style="color:red; font-size:10px; margin-top:5px; display:none;">${LinzuI18n.t('ui_invalid_key')}</div>
          <div style="margin-top:10px; display:flex; flex-direction:column; gap:5px; align-items:center;">
            <a href="https://buy.stripe.com/cNi3cv7txa1U1Pn8ZEaEE00" id="linzu-get-license-link" target="_blank" class="linzu-get-license-link" style="color:#1DA1F2; font-size:11px; text-decoration:none;">${LinzuI18n.t('ui_get_license')}</a>
            <a href="https://sites.google.com/view/sweeply-for-x/home/tokushoho" id="linzu-tokushoho-link" target="_blank" style="color:#657786; font-size:10px; text-decoration:underline;">${LinzuI18n.t('ui_tokushoho')}</a>
          </div>
      </div>

      <div id="linzu-main-controls">
        <div class="linzu-controls">
          <label class="linzu-control-item" for="linzu-owner">
            <input type="checkbox" id="linzu-owner"> ${LinzuI18n.t('ui_dynamic_owner')}
          </label>
          <input type="text" id="linzu-search" class="linzu-search-input" placeholder="${LinzuI18n.t('ui_dynamic_search')}">
        </div>

        <div class="linzu-stats">
          <span class="linzu-stats-label">${LinzuI18n.t('ui_removed')}</span> <span id="linzu-count">0</span>
        </div>
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

    // License Activation
    const activateBtn = document.getElementById('linzu-activate-btn');
    const licenseInput = document.getElementById('linzu-license-input');
    const licenseError = document.getElementById('linzu-license-error');

    if (activateBtn && licenseInput && licenseError) {
        activateBtn.addEventListener('click', () => {
            const key = licenseInput.value.trim().toUpperCase();
            const _tk = ['SWPLY', 'PRO', 'TEST', '2026'].join('-');
            const _pk = ['SWEEPLY', 'PRO', 'UNLIMITED'].join('-');

            if (key === _pk || key === _tk) {
                chrome.storage.local.set({ licenseStatus: 'active', licenseKey: key }, () => {
                    appSettings.licenseStatus = 'active';
                    licenseError.style.display = 'none';
                    updateUIText();

                    // Restart main features
                    if (appSettings.isEnabled) {
                        startObserver();
                        const articles = document.querySelectorAll('article[data-testid="tweet"]');
                        scanNodes(articles);
                    }
                });
            } else {
                licenseError.style.display = 'block';
                licenseError.textContent = LinzuI18n.t('ui_invalid_key');
            }
        });
    }

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
        updateUIText();
    });

    uiContainer.addEventListener('click', (e) => {
        if (uiContainer.classList.contains('linzu-minimized')) {
            appSettings.isMinimized = false;
            uiContainer.classList.remove('linzu-minimized');
            chrome.storage.local.set({ isMinimized: false });
            updateUIText();
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

function getReplyTargets(article) {
    const targets = new Set();
    try {
        const text = article.textContent || "";
        // 「Replying to @user」や「返信先: @user」を抽出
        const match = text.match(/(?:Replying to|返信先:\s*)@([a-zA-Z0-9_]+)/i);
        if (match) targets.add(match[1].toLowerCase());

        // DOM内のメンションリンクを抽出
        const links = article.querySelectorAll('a[href^="/"]');
        for (let link of links) {
            const linkText = link.textContent.trim();
            if (linkText.startsWith('@')) {
                targets.add(linkText.substring(1).toLowerCase());
            }
        }
    } catch(e) {}
    return targets;
}

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

// --- Filtering Logic (Permanent) ---

function applyThreadUserSpamFilter() {
    try {
        if (!appSettings.isEnabled || !appSettings.filterUserSpam || appSettings.licenseStatus !== 'active') return;

        const path = window.LINZU_MOCK_PATH || document.body.dataset.linzuMockPath || location.pathname;
        if (!path.includes('/status/')) return;

        const articles = document.querySelectorAll('article[data-testid="tweet"]');

        // 画面上部がスクロールアウトした際に、暗黙の文脈としてスレッド主を初期値とする。
        // これにより、DOMを上から下へスキャンするだけで「返信を表示」などの新階層にも自然に対応できる。
        let lastVisibleUser = currentThreadOP ? currentThreadOP.toLowerCase() : null;

        for (const article of articles) {
            // 修正1：未処理チェックの前に、まずハンドル名を取得する（DOMがあれば取得可能）
            const handle = getUsername(article);
            if (!handle) continue;
            const lowerHandle = handle.toLowerCase();

            // 既に非表示（別フィルター）ならスキップ（非表示要素は直前のユーザーとしてカウントしない）
            if (article.style.display === 'none' && !article.dataset.linzuSpamHidden) continue;

            // 修正2：未処理（linzuProcessed=false）の要素は原則スキップするが、
            // スレッド主（OP）のツイートだけは会話の文脈（バトン）を維持するために絶対にスキップしない。
            if (!article.dataset.linzuProcessed) {
                if (currentThreadOP && lowerHandle === currentThreadOP.toLowerCase()) {
                    // スレッド主なのでスキップせずに下（Step 1）の評価へ進め、lastVisibleUserを更新させる
                } else {
                    continue; // OP以外で未処理なら通常通りスキップ
                }
            }

            // ステータスIDが取得できない場合（読み込み中等）の対策
            let statusId = getStatusId(article);
            if (!statusId) {
                if (article.dataset.linzuTempId) {
                    statusId = article.dataset.linzuTempId;
                } else {
                    statusId = 'temp-' + Math.random().toString(36).substr(2, 9);
                    article.dataset.linzuTempId = statusId;
                }
            }

            // 【仮想スクロール保護】
            // 既に表示許可済みとしてリストに登録されている要素は、再評価をスキップして表示を維持
            if (mainListSeenUsers.has(lowerHandle) && mainListSeenUsers.get(lowerHandle).has(statusId)) {
                if (article.dataset.linzuSpamHidden) {
                    article.style.display = '';
                    delete article.dataset.linzuSpamHidden;
                }
                lastVisibleUser = lowerHandle; // 許可された要素なのでバトンを渡す
                continue;
            }

            // --- ステップ1：投稿主（Aさん）は無条件合格 ---
            if (currentThreadOP && lowerHandle === currentThreadOP.toLowerCase()) {
                if (article.dataset.linzuSpamHidden) {
                    article.style.display = '';
                    delete article.dataset.linzuSpamHidden;
                }
                lastVisibleUser = lowerHandle;
                continue;
            }

            // --- ステップ2：初登場のユーザーは無条件合格 ---
            if (!mainListSeenUsers.has(lowerHandle)) {
                if (article.dataset.linzuSpamHidden) {
                    article.style.display = '';
                    delete article.dataset.linzuSpamHidden;
                }
                mainListSeenUsers.set(lowerHandle, new Set([statusId]));
                lastVisibleUser = lowerHandle;
                continue;
            }

            // --- ステップ3：会話チェーン（ABAB）の厳格な救済 ---
            // 2回目以降の登場だが、「正当な会話」として許可する条件
            // 条件A: 直前の人が「スレッド主(OP)」である（A->B->A->B の連続性を保護）
            // 条件B: このツイートの「返信先」に、直前の表示者(lastVisibleUser)が含まれている
            const replyTargets = getReplyTargets(article);

            // 修正：lastVisibleUserの有無に関わらず、OPへの直接リプライなら救済する
            // 追加：主役ツイートの直下（lastVisibleUser === OP）は宛先が省略されるため暗黙のリプライとして救済する
            const isReplyToOP = currentThreadOP && (
                lowerHandle === currentThreadOP.toLowerCase() ||
                replyTargets.has(currentThreadOP.toLowerCase()) ||
                (lastVisibleUser && lastVisibleUser === currentThreadOP.toLowerCase())
            );
            const isDirectReplyToLast = lastVisibleUser && replyTargets.has(lastVisibleUser);

            if (isReplyToOP || isDirectReplyToLast) {
                if (article.dataset.linzuSpamHidden) {
                    article.style.display = '';
                    delete article.dataset.linzuSpamHidden;
                }
                mainListSeenUsers.get(lowerHandle).add(statusId);
                lastVisibleUser = lowerHandle;
                continue;
            }

            // --- ステップ4：それ以外の重複（連投・散発スパム）はすべて排除 ---
            // Caleb -> Kiki -> Caleb のようにターゲットが一致しない2回目以降は非表示
            article.style.display = 'none';
            article.dataset.linzuSpamHidden = 'true';
            // ※【重要】非表示にした場合は lastVisibleUser を更新しない（前の人を保持）
            continue;
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
  // 投稿主の判定を小文字に揃えて安全に比較
  const isOP = currentThreadOP && handle && handle.toLowerCase() === currentThreadOP.toLowerCase();

  if (appSettings.filterContent?.imageOnly) {
     if (!isOP) {
         // Xの仕様変更に対応した広範なメディア検知
         const hasMedia = article.querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"]');
         const hasTextDiv = article.querySelector('[data-testid="tweetText"]');

         // テキストを取得し、画像用の隠しリンク（[https://t.co/](https://t.co/)...）を削ぎ落としてから判定する
         let postText = hasTextDiv ? hasTextDiv.innerText : "";
         postText = postText.replace(/https?:\/\/\S+/g, '').trim();

         // メディアがあり、かつ実質的なテキストが無い場合は非表示
         if (hasMedia && postText.length === 0) return true;
     }
  }

  if (appSettings.filterContent?.shortPost) {
    const hasTextDiv = article.querySelector('[data-testid="tweetText"]');
    let postText = hasTextDiv ? hasTextDiv.innerText : "";
    // リンクを除外して純粋な文字数のみをカウントする
    postText = postText.replace(/https?:\/\/\S+/g, '').trim();
    if (hasTextDiv && postText.length > 0 && postText.length <= 5) return true;
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
    const tweetTextNode = article.querySelector('[data-testid="tweetText"]');
    const contentText = tweetTextNode ? tweetTextNode.innerText.trim() : "";

    if (tweetTextNode && contentText.length > 0) {
        // 通常の文字（英数字、ひらがな、カタカナ、漢字）が含まれているか判定
        const hasLetters = /[a-zA-Z0-9ぁ-んァ-ヶｱ-ﾝﾞﾟ一-龠]/.test(contentText);

        // 文字数に関係なく、通常の文字が含まれていない（絵文字や記号のみ）場合に弾く
        if (!hasLetters) {
            return true;
        }
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

    // スケルトンロード対策：StatusIDがまだ取得できない（DOM描画途中）場合はスキップし、再評価を待つ
    const statusId = getStatusId(article);
    if (!statusId) return;

    article.dataset.linzuProcessed = "true";

    // License Gate (Strict Mode)
    // If not active, skip ALL filtering
    if (appSettings.licenseStatus !== 'active') return;

    const handle = getUsername(article);

    // Identify OP (Thread view) FIRST to ensure absolute OP protection
    // ナビゲーション時に取得した「真の親スレッドID」と一致する場合のみ、OPとして確定させる
    // スクロールによるURLの動的変更に引きずられないようにする
    if (currentThreadBaseStatusId && currentThreadBaseStatusId === statusId) {
        currentThreadOP = handle;
    }

    if (currentThreadOP && handle && currentThreadOP.toLowerCase() === handle.toLowerCase()) {
        const replyTargets = getReplyTargets(article);
        replyTargets.forEach(target => opInteractedUsers.add(target));

        const hiddenArticles = document.querySelectorAll('article[data-linzu-hidden="true"], article[data-linzu-spam-hidden="true"]');
        hiddenArticles.forEach(hiddenArticle => {
            const hiddenHandle = getUsername(hiddenArticle);
            if (hiddenHandle && opInteractedUsers.has(hiddenHandle.toLowerCase())) {
                hiddenArticle.style.display = '';
                delete hiddenArticle.dataset.linzuHidden;
                delete hiddenArticle.dataset.linzuSpamHidden;
            }
        });

        markPermitted(statusId);
        return;
    }

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

    // Filter Checks (Strict Gating)
    const runFilters = () => {
        if (handle && typeof opInteractedUsers !== 'undefined' && opInteractedUsers.has(handle.toLowerCase())) return false;
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
    opInteractedUsers.clear();
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

function fastIdentifyOP() {
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length >= 2 && pathParts[2] === 'status') {
        currentThreadOP = pathParts[1].toLowerCase();
    }
}

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    if (!appSettings.isEnabled) return;

    if (location.href !== lastUrl) {
        // 無条件で強制リセット
        mainListSeenUsers.clear();
        resetSession();
        currentThreadOP = null;
        fastIdentifyOP(); // URLから即座にOPを特定

        if (isRealNavigation) {
            const match = location.pathname.match(/\/status\/(\d+)/);
            currentThreadBaseStatusId = match ? match[1] : null;

            restoreAllVisibility();
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            scanNodes(articles);

            isRealNavigation = false; // consume
        }
        lastUrl = location.href;
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

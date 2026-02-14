// Linzu Clean for X - Content Script

console.log('Linzu Clean: Content script loaded');

// Helper to update text content of UI elements
function updateUIText() {
  const title = document.querySelector('.linzu-title');
  const statsLabel = document.querySelector('.linzu-stats-label');

  if (title) title.textContent = LinzuI18n.t('appTitle');
  if (statsLabel) statsLabel.textContent = LinzuI18n.t('ui_removed');
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
  `;
  document.body.appendChild(uiContainer);

  const toggle = document.getElementById('linzu-toggle');
  const countDisplay = document.getElementById('linzu-count');

  // Load initial state
  chrome.storage.local.get(['isEnabled', 'removedCount'], (result) => {
    // Default to true if undefined
    const isEnabled = result.isEnabled !== undefined ? result.isEnabled : true;
    toggle.checked = isEnabled;

    const count = result.removedCount || 0;
    countDisplay.textContent = count;
  });

  // Toggle Event Listener
  toggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ isEnabled: isEnabled });
    console.log(`Linzu Clean: ${isEnabled ? 'Enabled' : 'Disabled'}`);
  });

  // Listen for storage changes to update UI across tabs if needed
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.removedCount) {
        countDisplay.textContent = changes.removedCount.newValue;
      }
      if (changes.isEnabled) {
        toggle.checked = changes.isEnabled.newValue;
      }
      if (changes.language) {
        // Update language immediately
        LinzuI18n.setLocale(changes.language.newValue, () => {
          updateUIText();
        });
      }
    }
  });
}

// Initialize I18n then inject UI
LinzuI18n.init(() => {
  injectFloatingUI();
});


// --- Filtering Logic ---

// Simple keyword check (sync)
function checkForKeywords(text) {
  const keywords = ['稼げる', 'spampromotion', 'zombietest', 'プロモーション'];
  return keywords.some(keyword => text.includes(keyword));
}

// AI Analysis Skeleton (async)
async function analyzePostWithAI(text) {
  // TODO: Implement actual AI call (e.g. to background script or external API)
  // For now, this is a placeholder that might simulate network delay
  return new Promise(resolve => {
    // Simulate complex check if needed
    resolve(false);
  });
}

function processTweet(article) {
  if (article.dataset.linzuChecked) return; // Already checked
  article.dataset.linzuChecked = "true";

  const text = article.innerText || "";

  // 1. Keyword Check (Fast)
  if (checkForKeywords(text)) {
    removeTweet(article, text);
    return;
  }

  // 2. AI Check (Slower) - Placeholder
  // analyzePostWithAI(text).then(isSpam => {
  //   if (isSpam) removeTweet(article, text);
  // });
}

function removeTweet(article, text) {
  article.style.display = 'none';
  article.dataset.linzuHidden = "true"; // Mark as hidden

  // Log to console
  console.log(`[Linzu Clean] Removed: ${text.substring(0, 50)}...`);

  // Update counter
  chrome.storage.local.get(['removedCount'], (result) => {
    const newCount = (result.removedCount || 0) + 1;
    chrome.storage.local.set({ removedCount: newCount });
    // UI update handled by storage listener
  });
}

function scanNodes(nodes) {
  nodes.forEach(node => {
    if (node.nodeType === 1) { // Element
      // Check if node is an article or contains articles
      if (node.tagName === 'ARTICLE') {
        processTweet(node);
      } else if (node.querySelectorAll) {
        const articles = node.querySelectorAll('article');
        articles.forEach(processTweet);
      }
    }
  });
}

// Mutation Observer Setup
const observer = new MutationObserver((mutations) => {
  chrome.storage.local.get(['isEnabled'], (result) => {
    if (result.isEnabled === false) return; // Explicitly check for false, undefined is true

    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        scanNodes(mutation.addedNodes);
      }
    });
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

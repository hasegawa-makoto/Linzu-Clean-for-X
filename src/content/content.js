// Linzu Clean for X - Content Script

console.log('Linzu Clean: Content script loaded');

function injectFloatingUI() {
  if (document.getElementById('linzu-floating-ui')) return;

  const uiContainer = document.createElement('div');
  uiContainer.id = 'linzu-floating-ui';
  uiContainer.innerHTML = `
    <div class="linzu-header">
      <span class="linzu-title">Linzu Clean</span>
      <label class="linzu-switch">
        <input type="checkbox" id="linzu-toggle">
        <span class="linzu-slider round"></span>
      </label>
    </div>
    <div class="linzu-stats">
      Removed: <span id="linzu-count">0</span>
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
    }
  });
}

// Initialize
injectFloatingUI();

// Mutation Observer Setup
const observer = new MutationObserver((mutations) => {
  chrome.storage.local.get(['isEnabled'], (result) => {
    if (!result.isEnabled) return;

    // Placeholder for filtering logic
    // In the future, we will iterate over mutations and nodes
    // and apply AI check.

    // Example loop (commented out):
    /*
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // Element
           // Check for tweets/replies
           // Run AI check
           // If unwanted, remove and increment counter
        }
      });
    });
    */
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

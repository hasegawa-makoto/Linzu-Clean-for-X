// src/background/background.js
// Service Worker for Linzu Clean for X

// 1. Initialize default settings on installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Linzu Clean] Extension Installed/Updated:', details.reason);

  if (details.reason === 'install') {
    chrome.storage.local.get(null, (items) => {
      // Set defaults if not present
      const defaultSettings = {
        isEnabled: true,
        removedCount: 0,
        isMinimized: false,
        language: 'ja',
        // Split Duplicates into two settings
        filterDuplicateContent: true, // New default
        filterUserSpam: true,         // New default
        // Legacy support: map old filterDuplicates if exists?
        // filterDuplicates: true, (Removed from defaults, but kept for migration logic if needed)

        filterUnverified: false,
        filterLanguage: 'all',
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
        licenseStatus: 'inactive', // Default to unlicensed
        licenseKey: ''
      };

      // Only set keys that don't exist
      const keysToSet = {};
      Object.keys(defaultSettings).forEach(key => {
          if (items[key] === undefined) {
              keysToSet[key] = defaultSettings[key];
          }
      });

      if (Object.keys(keysToSet).length > 0) {
          chrome.storage.local.set(keysToSet, () => {
              console.log('[Linzu Clean] Default settings initialized.');
          });
      }

      // Open options page on first install
      chrome.runtime.openOptionsPage();
    });
  }
});

// 2. Message Handling (e.g., Open Options from Content Script)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ status: 'ok' });
  }
  // Must return true if response is async (not needed here but good practice)
  return true;
});

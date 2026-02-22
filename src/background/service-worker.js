// Service Worker for Linzu Clean for X
console.log('Linzu Clean for X: Service Worker started');

chrome.runtime.onInstalled.addListener(() => {
  console.log('Linzu Clean for X: Installed');
  chrome.storage.local.set({
    isEnabled: true,
    removedCount: 0,
    filters: {}, // Cleared legacy filters
    // Rule-based settings defaults
    filterDuplicates: false,
    filterUnverified: false, // Updated: Hide Unverified Accounts
    filterLanguage: 'all', // 'all', 'ja', 'en'
    filterContent: {
      imageOnly: false,
      shortPost: false,
      excessiveLinks: false
    },
    // Bot settings
    filterBot: {
      digits: false,
      defaultIcon: false,
      emoji: false,
      links: false
    },
    customKeywords: [],

    language: 'ja' // Default UI language
  });
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
  }
});

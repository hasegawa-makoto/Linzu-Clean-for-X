// Service Worker for Linzu Clean for X
console.log('Linzu Clean for X: Service Worker started');

chrome.runtime.onInstalled.addListener(() => {
  console.log('Linzu Clean for X: Installed');
  chrome.storage.local.set({
    isEnabled: true,
    removedCount: 0,
    filters: {
      zombie: true,
      spam: true,
      toxic: true
    },
    // New rule-based settings defaults
    filterDuplicates: false,
    filterLanguage: 'all', // 'all', 'ja', 'en'
    filterContent: {
      imageOnly: false,
      shortPost: false,
      excessiveLinks: false
    },
    customKeywords: [],

    language: 'ja' // Default UI language
  });
});

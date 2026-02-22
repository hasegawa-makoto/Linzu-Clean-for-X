// src/options/options.js
const defaultContent = {
  imageOnly: false,
  shortPost: false,
  excessiveLinks: false
};

const defaultBot = {
  digits: false,
  defaultIcon: false,
  emoji: false,
  links: false
};

function saveOptions() {
  const filterContent = {
    imageOnly: document.getElementById('contentImageOnly').checked,
    shortPost: document.getElementById('contentShortPost').checked,
    excessiveLinks: document.getElementById('contentExcessiveLinks').checked
  };

  const filterBot = {
    digits: document.getElementById('botDigits').checked,
    defaultIcon: document.getElementById('botDefaultIcon').checked,
    emoji: document.getElementById('botEmoji').checked,
    links: document.getElementById('botLinks').checked
  };

  const filterDuplicates = document.getElementById('filterDuplicates').checked;
  const filterUnverified = document.getElementById('filterUnverified').checked;
  const filterLanguage = document.getElementById('filterLanguage').value;

  // Parse keywords from textarea (split by newline, trim, remove empty)
  const keywordsText = document.getElementById('customKeywords').value;
  const customKeywords = keywordsText.split('\n').map(k => k.trim()).filter(k => k.length > 0);

  chrome.storage.local.set({
    filterContent: filterContent,
    filterBot: filterBot,
    filterDuplicates: filterDuplicates,
    filterUnverified: filterUnverified,
    filterLanguage: filterLanguage,
    customKeywords: customKeywords
  }, () => {
    showStatus();
  });
}

function showStatus() {
  const status = document.getElementById('status');
  status.textContent = LinzuI18n.t('opt_status_saved');
  status.style.display = 'block';
  setTimeout(() => {
    status.style.display = 'none';
  }, 1500);
}

function restoreOptions() {
  chrome.storage.local.get([
    'language',
    'filterDuplicates',
    'filterUnverified',
    'filterVerified', // legacy check
    'filterLanguage',
    'filterContent',
    'filterBot',
    'customKeywords'
  ], (result) => {

    // UI Language
    const lang = result.language || 'ja';
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
      langSelect.value = lang;
    }

    // New Rules
    document.getElementById('filterDuplicates').checked = result.filterDuplicates || false;
    document.getElementById('filterLanguage').value = result.filterLanguage || 'all';

    // Unverified
    if (result.filterUnverified !== undefined) {
        document.getElementById('filterUnverified').checked = result.filterUnverified;
    } else {
        // Migration from old filterVerified logic
        // Old: filterVerified = { non_blue: true/false }
        if (result.filterVerified && typeof result.filterVerified === 'object') {
            document.getElementById('filterUnverified').checked = result.filterVerified.non_blue || false;
        } else {
            document.getElementById('filterUnverified').checked = false;
        }
    }

    const content = result.filterContent || defaultContent;
    document.getElementById('contentImageOnly').checked = content.imageOnly || false;
    document.getElementById('contentShortPost').checked = content.shortPost || false;
    document.getElementById('contentExcessiveLinks').checked = content.excessiveLinks || false;

    const bot = result.filterBot || defaultBot;
    document.getElementById('botDigits').checked = bot.digits || false;
    document.getElementById('botDefaultIcon').checked = bot.defaultIcon || false;
    document.getElementById('botEmoji').checked = bot.emoji || false;
    document.getElementById('botLinks').checked = bot.links || false;

    const keywords = result.customKeywords || [];
    document.getElementById('customKeywords').value = keywords.join('\n');

    // Initialize I18n
    LinzuI18n.init(() => {
      LinzuI18n.translatePage();
    });
  });
}

function handleLanguageChange(e) {
  const newLang = e.target.value;
  LinzuI18n.setLocale(newLang, () => {
    LinzuI18n.translatePage();
    showStatus();
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);

// Add event listeners to all inputs
const inputs = document.querySelectorAll('input, select, textarea');
inputs.forEach(input => {
    if (input.id === 'language-select') {
        input.addEventListener('change', handleLanguageChange);
    } else {
        input.addEventListener('change', saveOptions);
    }
});


// Listen for storage changes in case changed from another tab/popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.language) {
      const newLang = changes.language.newValue;
      const langSelect = document.getElementById('language-select');
      if (langSelect && langSelect.value !== newLang) {
        langSelect.value = newLang;
        LinzuI18n.setLocale(newLang, () => {
          LinzuI18n.translatePage();
        });
      }
    }
  }
});

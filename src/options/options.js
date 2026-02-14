// src/options/options.js
const defaultFilters = {
  zombie: true,
  spam: true,
  toxic: true
};

const defaultContent = {
  imageOnly: false,
  shortPost: false,
  excessiveLinks: false
};

function saveOptions() {
  const filters = {
    zombie: document.getElementById('zombie').checked,
    spam: document.getElementById('spam').checked,
    toxic: document.getElementById('toxic').checked
  };

  const filterContent = {
    imageOnly: document.getElementById('contentImageOnly').checked,
    shortPost: document.getElementById('contentShortPost').checked,
    excessiveLinks: document.getElementById('contentExcessiveLinks').checked
  };

  const filterDuplicates = document.getElementById('filterDuplicates').checked;
  const filterLanguage = document.getElementById('filterLanguage').value;

  // Parse keywords from textarea (split by newline, trim, remove empty)
  const keywordsText = document.getElementById('customKeywords').value;
  const customKeywords = keywordsText.split('\n').map(k => k.trim()).filter(k => k.length > 0);

  chrome.storage.local.set({
    filters: filters,
    filterContent: filterContent,
    filterDuplicates: filterDuplicates,
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
    'filters',
    'language',
    'filterDuplicates',
    'filterLanguage',
    'filterContent',
    'customKeywords'
  ], (result) => {

    // Legacy Filters
    const filters = result.filters || defaultFilters;
    document.getElementById('zombie').checked = filters.zombie !== undefined ? filters.zombie : defaultFilters.zombie;
    document.getElementById('spam').checked = filters.spam !== undefined ? filters.spam : defaultFilters.spam;
    document.getElementById('toxic').checked = filters.toxic !== undefined ? filters.toxic : defaultFilters.toxic;

    // UI Language
    const lang = result.language || 'ja';
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
      langSelect.value = lang;
    }

    // New Rules
    document.getElementById('filterDuplicates').checked = result.filterDuplicates || false;
    document.getElementById('filterLanguage').value = result.filterLanguage || 'all';

    const content = result.filterContent || defaultContent;
    document.getElementById('contentImageOnly').checked = content.imageOnly || false;
    document.getElementById('contentShortPost').checked = content.shortPost || false;
    document.getElementById('contentExcessiveLinks').checked = content.excessiveLinks || false;

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

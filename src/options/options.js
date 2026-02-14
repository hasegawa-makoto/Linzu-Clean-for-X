// src/options/options.js
const defaultFilters = {
  zombie: true,
  spam: true,
  toxic: true
};

function saveOptions() {
  const filters = {
    zombie: document.getElementById('zombie').checked,
    spam: document.getElementById('spam').checked,
    toxic: document.getElementById('toxic').checked
  };

  chrome.storage.local.set({ filters: filters }, () => {
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
  chrome.storage.local.get(['filters', 'language'], (result) => {
    // Restore filters
    const filters = result.filters || defaultFilters;
    document.getElementById('zombie').checked = filters.zombie !== undefined ? filters.zombie : defaultFilters.zombie;
    document.getElementById('spam').checked = filters.spam !== undefined ? filters.spam : defaultFilters.spam;
    document.getElementById('toxic').checked = filters.toxic !== undefined ? filters.toxic : defaultFilters.toxic;

    // Restore Language
    const lang = result.language || 'ja';
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
      langSelect.value = lang;
    }

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
document.getElementById('zombie').addEventListener('change', saveOptions);
document.getElementById('spam').addEventListener('change', saveOptions);
document.getElementById('toxic').addEventListener('change', saveOptions);
document.getElementById('language-select').addEventListener('change', handleLanguageChange);

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

// src/utils/i18n.js
// Global object for Linzu Clean i18n
window.LinzuI18n = {
  currentLocale: 'ja',

  translations: {
    ja: {
      appTitle: 'Linzu Clean',
      ui_removed: '除去件数:',
      ui_switch_label: 'ON/OFF',
      opt_title: 'フィルタ設定',
      opt_zombie: 'インプレゾンビを除去',
      opt_spam: 'プロモーション・スパムを除去',
      opt_toxic: '感情的なトゲを除去',
      opt_lang: '言語設定',
      opt_status_saved: '設定を保存しました。',
      popup_status: 'ステータス:',
      popup_active: '有効',
      popup_disabled: '無効',
      popup_settings: '設定を開く',
      lang_ja: '日本語',
      lang_en: 'English'
    },
    en: {
      appTitle: 'Linzu Clean',
      ui_removed: 'Removed:',
      ui_switch_label: 'ON/OFF',
      opt_title: 'Filter Settings',
      opt_zombie: 'Remove Impression Zombies',
      opt_spam: 'Remove Promotion/Spam',
      opt_toxic: 'Remove Toxic Content',
      opt_lang: 'Language Settings',
      opt_status_saved: 'Settings saved.',
      popup_status: 'Status:',
      popup_active: 'Active',
      popup_disabled: 'Disabled',
      popup_settings: 'Open Settings',
      lang_ja: 'Japanese',
      lang_en: 'English'
    }
  },

  init: function(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['language'], (result) => {
        this.currentLocale = result.language || 'ja';
        if (callback) callback();
      });
    } else {
      // Fallback or mock environment
      this.currentLocale = 'ja';
      if (callback) callback();
    }
  },

  setLocale: function(locale, callback) {
    if (this.translations[locale]) {
      this.currentLocale = locale;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ language: locale }, () => {
          if (callback) callback();
        });
      } else {
        if (callback) callback();
      }
    }
  },

  t: function(key) {
    const localeData = this.translations[this.currentLocale] || this.translations['ja'];
    return localeData[key] || key;
  },

  // Helper to translate all elements with data-i18n attribute
  translatePage: function() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = this.t(key);
      }
    });
  }
};

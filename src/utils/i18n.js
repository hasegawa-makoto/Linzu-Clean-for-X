// src/utils/i18n.js
// Global object for Linzu Clean i18n
window.LinzuI18n = {
  currentLocale: 'ja',

  translations: {
    ja: {
      appTitle: 'Linzu Clean',
      ui_removed: '除去件数:',
      ui_switch_label: 'ON/OFF',
      ui_settings: '設定',

      opt_title: 'フィルタ設定',
      opt_ui_lang: 'UI表示言語',
      opt_content_lang: '表示を維持する言語',

      opt_lang_all: 'すべて',
      opt_lang_ja: '日本語のみ',
      opt_lang_en: '英語のみ',

      opt_duplicates_title: '重複投稿の排除',
      opt_duplicates_desc: '同じ内容の投稿が2回目以降表示された場合に非表示にする',

      opt_verified_title: '認証済みアカウント',
      opt_verified_desc: '認証マーク(Blue Check)が付いたアカウントの投稿を非表示にする',

      opt_content_title: 'コンテンツ制限',
      opt_content_img: '画像/動画のみの投稿を非表示',
      opt_content_short: '5文字以下の短文を非表示',
      opt_content_links: '過剰なリンク/ハッシュタグを含む投稿を非表示',

      opt_keywords_title: 'カスタムキーワード',
      opt_keywords_placeholder: '非表示にしたい単語を1行に1つ入力してください',

      opt_zombie: 'インプレゾンビを除去',
      opt_spam: 'プロモーション・スパムを除去',
      opt_toxic: '感情的なトゲを除去',

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
      ui_settings: 'Settings',

      opt_title: 'Filter Settings',
      opt_ui_lang: 'UI Language',
      opt_content_lang: 'Keep Content Language',

      opt_lang_all: 'All',
      opt_lang_ja: 'Japanese Only',
      opt_lang_en: 'English Only',

      opt_duplicates_title: 'Remove Duplicates',
      opt_duplicates_desc: 'Hide subsequent posts with identical content within the session.',

      opt_verified_title: 'Verified Accounts',
      opt_verified_desc: 'Hide posts from accounts with a Verified (Blue Check) mark.',

      opt_content_title: 'Content Restrictions',
      opt_content_img: 'Hide Image/Video Only Posts',
      opt_content_short: 'Hide Short Posts (<= 5 chars)',
      opt_content_links: 'Hide Posts with Excessive Links/Tags',

      opt_keywords_title: 'Custom Keywords',
      opt_keywords_placeholder: 'Enter words to block, one per line',

      opt_zombie: 'Remove Impression Zombies',
      opt_spam: 'Remove Promotion/Spam',
      opt_toxic: 'Remove Toxic Content',

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
      } else {
        // Handle placeholders for textareas/inputs
        const placeholderKey = el.getAttribute('data-i18n-placeholder');
        if (placeholderKey) {
          el.placeholder = this.t(placeholderKey);
        }
      }
    });

    // Also check elements with data-i18n-placeholder directly
    const inputs = document.querySelectorAll('[data-i18n-placeholder]');
    inputs.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.placeholder = this.t(key);
      }
    });
  }
};

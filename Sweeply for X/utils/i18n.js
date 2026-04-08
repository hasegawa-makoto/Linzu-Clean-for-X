// src/utils/i18n.js
// Global object for Linzu Clean i18n
window.LinzuI18n = {
  currentLocale: 'ja',

  translations: {
    ja: {
      appTitle: 'Sweeply for X',
      appShortName: 'Sweeply',
      ui_removed: '除去件数:',
      ui_switch_label: 'ON/OFF',
      ui_settings: '設定',
      ui_hide_panel: 'パネルを閉じる',
      ui_show_panel: 'パネルを表示',
      ui_license_required: '有効なライセンスが必要です',
      ui_license_req_title: 'ライセンスキーが必要です',
      ui_activate_btn: '認証',
      ui_invalid_key: '無効なキーです',
      ui_get_license: 'ライセンスを取得する',
      ui_tokushoho: '特定商取引法に基づく表記',

      ui_dynamic_owner: '本人のみ表示',
      ui_dynamic_search: 'ユーザー検索 (@ID)',

      opt_title: 'フィルタ設定',
      opt_ui_lang: 'UI表示言語',
      opt_content_lang: '表示を維持する言語',

      opt_license_title: 'Proライセンス',
      opt_license_desc: '全機能を利用するにはライセンスキーを入力してください。',
      opt_activate: '認証する',
      opt_deactivate: '認証解除',
      opt_license_active: 'PROライセンス有効',
      opt_license_inactive: '未認証 (機能制限中)',

      opt_lang_all: 'すべて',
      opt_lang_ja: '日本語のみ',
      opt_lang_en: '英語のみ',

      opt_duplicate_content: '【内容重複】同じテキストの投稿を非表示 (最古以外)',
      opt_user_spam: '【ユーザー連投】同じ人の複数回リプライを非表示 (2回目以降)',

      opt_verified_title: 'アカウント認証フィルター',
      opt_unverified_title: '未認証アカウント(青バッジなし)を非表示',
      opt_general_title: '一般設定',

      opt_content_title: 'コンテンツ制限',
      opt_content_img: '画像/動画のみの投稿を非表示 (投稿主は除く)',
      opt_content_short: '5文字以下の短文を非表示',
      opt_content_links: '過剰なリンク/ハッシュタグを含む投稿を非表示',

      opt_bot_title: 'ボット(ゾンビ)検知',
      opt_bot_digits: 'ID末尾が数字5桁以上のアカウント',
      opt_bot_default_icon: '初期アイコン(画像なし)のアカウント',
      opt_bot_emoji: '絵文字や記号のみのリプライ',
      opt_bot_links: '外部リンク付きのリプライ',

      opt_keywords_title: 'カスタムキーワード',
      opt_keywords_placeholder: '非表示にしたい単語を1行に1つ入力してください',

      opt_status_saved: '設定を保存しました。',
      opt_save: '設定を保存',

      popup_status: 'ステータス:',
      popup_active: '有効',
      popup_disabled: '無効',
      popup_settings: '設定を開く',
      lang_ja: '日本語',
      lang_en: 'English'
    },
    en: {
      appTitle: 'Sweeply for X',
      appShortName: 'Sweeply',
      ui_removed: 'Removed:',
      ui_switch_label: 'ON/OFF',
      ui_settings: 'Settings',
      ui_hide_panel: 'Hide Panel',
      ui_show_panel: 'Show Panel',
      ui_license_required: 'Valid License Required',
      ui_license_req_title: 'License key required',
      ui_activate_btn: 'Activate',
      ui_invalid_key: 'Invalid Key',
      ui_get_license: 'Get a License key',
      ui_tokushoho: 'Legal Notice (Tokushoho)',

      ui_dynamic_owner: 'Owner Only',
      ui_dynamic_search: 'Focus User (@ID)',

      opt_title: 'Filter Settings',
      opt_ui_lang: 'UI Language',
      opt_content_lang: 'Keep Content Language',

      opt_license_title: 'Pro License',
      opt_license_desc: 'Enter your license key to unlock full features.',
      opt_activate: 'Activate',
      opt_deactivate: 'Deactivate',
      opt_license_active: 'PRO License Active',
      opt_license_inactive: 'Unlicensed (Limited Mode)',

      opt_lang_all: 'All',
      opt_lang_ja: 'Japanese Only',
      opt_lang_en: 'English Only',

      opt_duplicate_content: 'Content: Hide identical text (Keep oldest)',
      opt_user_spam: 'User Spam: Hide 2nd+ reply from same user',

      opt_verified_title: 'Verified Account Filter',
      opt_unverified_title: 'Hide Unverified (No Blue Check) Accounts',
      opt_general_title: 'General Settings',

      opt_content_title: 'Content Restrictions',
      opt_content_img: 'Hide Image/Video Only Posts (Excludes OP)',
      opt_content_short: 'Hide Short Posts (<= 5 chars)',
      opt_content_links: 'Hide Posts with Excessive Links/Tags',

      opt_bot_title: 'Bot Detection',
      opt_bot_digits: 'Hide IDs with 5+ trailing digits',
      opt_bot_default_icon: 'Hide Default Icon Users',
      opt_bot_emoji: 'Hide Emoji/Symbols-only Replies',
      opt_bot_links: 'Hide Replies with External Links',

      opt_keywords_title: 'Custom Keywords',
      opt_keywords_placeholder: 'Enter words to block, one per line',

      opt_status_saved: 'Settings saved.',
      opt_save: 'Save Settings',

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

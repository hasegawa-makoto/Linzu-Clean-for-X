// src/popup/popup.js
document.getElementById('open-options').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options/options.html'));
  }
});

chrome.storage.local.get(['isEnabled', 'language'], (result) => {
  const statusEl = document.getElementById('status');
  LinzuI18n.init(() => {
    LinzuI18n.translatePage();
    if (result.isEnabled === false) {
      statusEl.textContent = LinzuI18n.t('popup_disabled');
      statusEl.style.color = 'red';
    } else {
      statusEl.textContent = LinzuI18n.t('popup_active');
      statusEl.style.color = 'green';
    }
  });
});

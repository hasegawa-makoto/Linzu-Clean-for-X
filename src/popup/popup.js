// src/popup/popup.js
document.getElementById('open-options').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options/options.html'));
  }
});

chrome.storage.local.get(['isEnabled'], (result) => {
  const statusEl = document.getElementById('status');
  if (result.isEnabled === false) {
    statusEl.textContent = 'Disabled';
    statusEl.style.color = 'red';
  } else {
    statusEl.textContent = 'Active';
    statusEl.style.color = 'green';
  }
});

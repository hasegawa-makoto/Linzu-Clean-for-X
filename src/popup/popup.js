// src/popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
  const statusValue = document.getElementById('status-value');
  const toggleBtn = document.getElementById('toggle-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const licenseLabel = document.getElementById('license-status');

  // Load state
  chrome.storage.local.get(['isEnabled', 'licenseStatus'], (result) => {
    updateStatus(result.isEnabled);
    updateLicense(result.licenseStatus);
  });

  // Toggle button
  toggleBtn.addEventListener('click', () => {
    chrome.storage.local.get('isEnabled', (result) => {
      const newState = !result.isEnabled;
      chrome.storage.local.set({ isEnabled: newState });
      updateStatus(newState);
    });
  });

  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  function updateStatus(isEnabled) {
    if (isEnabled) {
      statusValue.textContent = LinzuI18n.t('popup_active');
      statusValue.className = 'status-value status-active';
      toggleBtn.textContent = LinzuI18n.t('popup_disabled'); // Button says "Disable"
    } else {
      statusValue.textContent = LinzuI18n.t('popup_disabled');
      statusValue.className = 'status-value status-disabled';
      toggleBtn.textContent = LinzuI18n.t('popup_active'); // Button says "Enable"
    }
  }

  function updateLicense(status) {
    if (status === 'active') {
        licenseLabel.textContent = 'PRO License Active';
        licenseLabel.style.color = 'green';
    } else {
        licenseLabel.textContent = 'Unlicensed (Limited Mode)';
        licenseLabel.style.color = 'orange';
    }
  }

  // I18n
  LinzuI18n.init(() => {
    LinzuI18n.translatePage();
  });
});

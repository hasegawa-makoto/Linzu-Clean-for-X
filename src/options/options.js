// src/options/options.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const licenseKeyInput = document.getElementById('license-key');
    const activateBtn = document.getElementById('activate-btn');
    const licenseMsg = document.getElementById('license-msg');
    const saveBtn = document.getElementById('save-btn');
    const statusMsg = document.getElementById('status-msg');

    // Checkboxes
    const filterDuplicates = document.getElementById('filter-duplicates');
    const filterUnverified = document.getElementById('filter-unverified');

    const contentImageOnly = document.getElementById('content-image-only');
    const contentShort = document.getElementById('content-short');
    const contentLinks = document.getElementById('content-links');

    const botDigits = document.getElementById('bot-digits');
    const botIcon = document.getElementById('bot-icon');
    const botEmoji = document.getElementById('bot-emoji');
    const botLinks = document.getElementById('bot-links');

    const customKeywords = document.getElementById('custom-keywords');

    // --- Init ---
    LinzuI18n.init(() => {
        LinzuI18n.translatePage();
        loadOptions();
    });

    // --- Load ---
    function loadOptions() {
        // Load License
        LinzuLicense.init((isValid) => {
            if (isValid) {
                licenseMsg.textContent = 'PRO License Active';
                licenseMsg.className = 'status-msg success';
                licenseKeyInput.value = LinzuLicense.key;
                licenseKeyInput.disabled = true;
                activateBtn.textContent = 'Deactivate';
            } else {
                licenseMsg.textContent = 'Unlicensed (Limited Mode)';
                licenseMsg.className = 'status-msg error';
            }
        });

        // Load Settings
        chrome.storage.local.get(null, (items) => {
            if (filterDuplicates) filterDuplicates.checked = items.filterDuplicates || false;
            if (filterUnverified) filterUnverified.checked = items.filterUnverified || false;

            if (items.filterContent) {
                if (contentImageOnly) contentImageOnly.checked = items.filterContent.imageOnly || false;
                if (contentShort) contentShort.checked = items.filterContent.shortPost || false;
                if (contentLinks) contentLinks.checked = items.filterContent.excessiveLinks || false;
            }

            if (items.filterBot) {
                if (botDigits) botDigits.checked = items.filterBot.digits || false;
                if (botIcon) botIcon.checked = items.filterBot.defaultIcon || false;
                if (botEmoji) botEmoji.checked = items.filterBot.emoji || false;
                if (botLinks) botLinks.checked = items.filterBot.links || false;
            }

            if (items.customKeywords && customKeywords) {
                customKeywords.value = items.customKeywords.join('\n');
            }
        });
    }

    // --- License Action ---
    if (activateBtn) {
        activateBtn.addEventListener('click', () => {
            if (activateBtn.textContent === 'Deactivate') {
                LinzuLicense.deactivate(() => {
                    licenseMsg.textContent = 'Deactivated.';
                    licenseMsg.className = 'status-msg';
                    licenseKeyInput.value = '';
                    licenseKeyInput.disabled = false;
                    activateBtn.textContent = 'Activate';
                });
            } else {
                const key = licenseKeyInput.value;
                LinzuLicense.activate(key, (success) => {
                    if (success) {
                        licenseMsg.textContent = 'Activation Successful!';
                        licenseMsg.className = 'status-msg success';
                        licenseKeyInput.disabled = true;
                        activateBtn.textContent = 'Deactivate';
                    } else {
                        licenseMsg.textContent = 'Invalid Key.';
                        licenseMsg.className = 'status-msg error';
                    }
                });
            }
        });
    }

    // --- Save ---
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const settings = {
                filterDuplicates: filterDuplicates ? filterDuplicates.checked : false,
                filterUnverified: filterUnverified ? filterUnverified.checked : false,
                filterContent: {
                    imageOnly: contentImageOnly ? contentImageOnly.checked : false,
                    shortPost: contentShort ? contentShort.checked : false,
                    excessiveLinks: contentLinks ? contentLinks.checked : false
                },
                filterBot: {
                    digits: botDigits ? botDigits.checked : false,
                    defaultIcon: botIcon ? botIcon.checked : false,
                    emoji: botEmoji ? botEmoji.checked : false,
                    links: botLinks ? botLinks.checked : false
                },
                customKeywords: customKeywords ? customKeywords.value.split('\n').filter(k => k.trim() !== '') : []
            };

            chrome.storage.local.set(settings, () => {
                statusMsg.textContent = LinzuI18n.t('opt_status_saved');
                statusMsg.className = 'status-msg success';
                setTimeout(() => { statusMsg.textContent = ''; }, 2000);
            });
        });
    }
});

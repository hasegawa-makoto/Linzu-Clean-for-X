// src/options/options.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const uiLanguageSelect = document.getElementById('ui-language');
    const licenseKeyInput = document.getElementById('license-key');
    const activateBtn = document.getElementById('activate-btn');
    const licenseMsg = document.getElementById('license-msg');

    // Checkboxes & Selects
    const filterLanguageSelect = document.getElementById('filter-language');
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
    const saveBtn = document.getElementById('save-btn');
    const statusMsg = document.getElementById('status-msg');

    // --- Init ---
    LinzuI18n.init(() => {
        loadOptions();
        // Translate initially
        LinzuI18n.translatePage();
    });

    // --- UI Language Change ---
    uiLanguageSelect.addEventListener('change', (e) => {
        const newLang = e.target.value;
        // Apply immediately to I18n
        LinzuI18n.setLocale(newLang, () => {
             LinzuI18n.translatePage();
             // Update dynamic texts
             updateLicenseStatusText();
             // Update button text
             if (licenseKeyInput.disabled) {
                 activateBtn.textContent = LinzuI18n.t('opt_deactivate');
             } else {
                 activateBtn.textContent = LinzuI18n.t('opt_activate');
             }
        });
    });

    // --- Load ---
    function loadOptions() {
        // Load Settings first
        chrome.storage.local.get(null, (items) => {
            // UI Lang
            if (items.language) {
                uiLanguageSelect.value = items.language;
                LinzuI18n.setLocale(items.language, () => {
                    LinzuI18n.translatePage();
                });
            } else {
                uiLanguageSelect.value = 'ja'; // default
            }

            // License
            LinzuLicense.init((isValid) => {
               updateLicenseStatusText(isValid);
               if (isValid) {
                    licenseKeyInput.value = LinzuLicense.key;
                    licenseKeyInput.disabled = true;
                    activateBtn.textContent = LinzuI18n.t('opt_deactivate');
               } else {
                    licenseKeyInput.disabled = false;
                    activateBtn.textContent = LinzuI18n.t('opt_activate');
               }
            });

            // Filters
            if (filterLanguageSelect) filterLanguageSelect.value = items.filterLanguage || 'all';
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
                if (items.customKeywords && Array.isArray(items.customKeywords)) {
                    customKeywords.value = items.customKeywords.join('\n');
                }
            }
        });
    }

    function updateLicenseStatusText(isValid) {
        // If isValid is not passed, re-check
        if (isValid === undefined) {
             isValid = LinzuLicense.check();
        }

        if (isValid) {
            licenseMsg.textContent = LinzuI18n.t('opt_license_active');
            licenseMsg.className = 'status-msg success';
        } else {
            licenseMsg.textContent = LinzuI18n.t('opt_license_inactive');
            licenseMsg.className = 'status-msg error';
        }
    }

    // --- License Action ---
    if (activateBtn) {
        activateBtn.addEventListener('click', () => {
            if (licenseKeyInput.disabled) {
                // Deactivate
                LinzuLicense.deactivate(() => {
                    updateLicenseStatusText(false);
                    licenseKeyInput.value = '';
                    licenseKeyInput.disabled = false;
                    activateBtn.textContent = LinzuI18n.t('opt_activate');
                });
            } else {
                // Activate
                const key = licenseKeyInput.value;
                LinzuLicense.activate(key, (success) => {
                    if (success) {
                        updateLicenseStatusText(true);
                        licenseKeyInput.disabled = true;
                        activateBtn.textContent = LinzuI18n.t('opt_deactivate');
                    } else {
                        licenseMsg.textContent = 'Invalid Key.'; // Not translated for error detail yet
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
                language: uiLanguageSelect.value, // Save UI language
                filterLanguage: filterLanguageSelect ? filterLanguageSelect.value : 'all',
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

                // Also update locale immediately to storage (redundant but safe)
                LinzuI18n.setLocale(uiLanguageSelect.value);
            });
        });
    }
});

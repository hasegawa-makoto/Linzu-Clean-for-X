const LinzuLicense = {
    isValid: false,
    key: '',

    init: function(callback) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['licenseKey', 'licenseStatus'], (result) => {
                const isValid = (result.licenseStatus === 'active');
                this.isValid = isValid;
                this.key = result.licenseKey || '';
                if (callback) callback(isValid);
            });
        } else {
            // Fallback
            this.isValid = false;
            if (callback) callback(false);
        }
    },

    activate: function(key, callback) {
        const cleanKey = key.trim().toUpperCase();
        let success = false;

        // Dummy Validation: Must start with LINZU-PRO- and be longer than 10 chars
        if (cleanKey.startsWith('LINZU-PRO-') && cleanKey.length > 10) {
            success = true;
        }

        if (success) {
            this.isValid = true;
            this.key = cleanKey;
            chrome.storage.local.set({
                licenseKey: cleanKey,
                licenseStatus: 'active'
            }, () => {
                if (callback) callback(true);
            });
        } else {
            this.isValid = false;
            chrome.storage.local.set({ licenseStatus: 'inactive' }, () => {
                if (callback) callback(false);
            });
        }
    },

    deactivate: function(callback) {
        this.isValid = false;
        this.key = '';
        chrome.storage.local.remove(['licenseKey', 'licenseStatus'], () => {
            if (callback) callback();
        });
    },

    check: function() {
        return this.isValid;
    }
};

// Export to window
if (typeof window !== 'undefined') {
    window.LinzuLicense = LinzuLicense;
}

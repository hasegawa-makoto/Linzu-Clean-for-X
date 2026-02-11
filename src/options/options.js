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
    const status = document.getElementById('status');
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
    }, 1500);
  });
}

function restoreOptions() {
  chrome.storage.local.get(['filters'], (result) => {
    const filters = result.filters || defaultFilters;
    document.getElementById('zombie').checked = filters.zombie !== undefined ? filters.zombie : defaultFilters.zombie;
    document.getElementById('spam').checked = filters.spam !== undefined ? filters.spam : defaultFilters.spam;
    document.getElementById('toxic').checked = filters.toxic !== undefined ? filters.toxic : defaultFilters.toxic;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('zombie').addEventListener('change', saveOptions);
document.getElementById('spam').addEventListener('change', saveOptions);
document.getElementById('toxic').addEventListener('change', saveOptions);

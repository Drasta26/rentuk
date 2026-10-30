// Small pure helpers shared by the app and the tests.
(function (root) {
  'use strict';

  // Escape text before it is inserted into HTML with innerHTML.
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const RentUKLib = { escapeHtml };

  if (typeof module !== 'undefined' && module.exports) module.exports = RentUKLib;
  else root.RentUKLib = RentUKLib;
})(typeof window !== 'undefined' ? window : globalThis);

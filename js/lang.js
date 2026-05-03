/**
 * Portfolio Language Switcher Utility
 * Shared across all pages (loaded as regular script, not Babel).
 */
(function () {
  window.PORTFOLIO_LANG = localStorage.getItem('portfolio-lang') || 'de';

  window.setPortfolioLang = function (lang) {
    localStorage.setItem('portfolio-lang', lang);
    location.reload();
  };

  /* ── inject switcher into any element with id="lang-switcher-root" ── */
  function injectSwitcher() {
    var root = document.getElementById('lang-switcher-root');
    if (!root) return;
    var lang = window.PORTFOLIO_LANG;
    root.innerHTML = '';
    ['en', 'de'].forEach(function (l) {
      var btn = document.createElement('button');
      btn.textContent = l.toUpperCase();
      btn.setAttribute('aria-label', 'Switch language to ' + l.toUpperCase());
      btn.className = 'lang-btn' + (l === lang ? ' lang-btn-active' : '');
      btn.onclick = function () { window.setPortfolioLang(l); };
      root.appendChild(btn);
    });
  }

  /* ── apply data-i18n translations (for non-React pages) ── */
  function applyTranslations(TRANS) {
    var lang = window.PORTFOLIO_LANG;
    if (!TRANS || !TRANS[lang]) return;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (TRANS[lang][key] !== undefined) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (el.hasAttribute('placeholder')) el.placeholder = TRANS[lang][key];
          else el.value = TRANS[lang][key];
        } else if (el.hasAttribute('data-i18n-placeholder')) {
          el.placeholder = TRANS[lang][key];
        } else {
          el.textContent = TRANS[lang][key];
        }
      }
    });
  }

  window._langApply = applyTranslations;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSwitcher);
  } else {
    injectSwitcher();
  }
})();

(function () {
  'use strict';

  let deferredPrompt = null;
  const bar = document.getElementById('pwaInstallBar');
  const installBtn = document.getElementById('pwaInstallBtn');
  const closeBtn = document.getElementById('pwaInstallClose');
  const help = document.getElementById('pwaHelp');
  const helpClose = document.getElementById('pwaHelpClose');
  const helpOk = document.getElementById('pwaHelpOk');
  const helpText = document.getElementById('pwaHelpText');

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const hide = () => { if (bar) bar.classList.add('is-hidden'); };
  const show = () => { if (bar && !isStandalone()) bar.classList.remove('is-hidden'); };
  const openHelp = (text) => {
    if (!help) return;
    if (helpText && text) helpText.innerHTML = text;
    help.hidden = false;
  };
  const closeHelp = () => { if (help) help.hidden = true; };

  if (isStandalone()) hide();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    show();
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (result && result.outcome === 'accepted') hide();
        return;
      }

      const ua = navigator.userAgent || '';
      if (/iPhone|iPad|iPod/i.test(ua)) {
        openHelp('اضغط زر <b>المشاركة</b> في المتصفح ثم اختر <b>إضافة إلى الشاشة الرئيسية</b>.');
      } else {
        openHelp('من قائمة المتصفح <b>⋮</b> اختر <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>.');
      }
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', hide);
  if (helpClose) helpClose.addEventListener('click', closeHelp);
  if (helpOk) helpOk.addEventListener('click', closeHelp);
  if (help) help.addEventListener('click', e => { if (e.target === help) closeHelp(); });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hide();
  });

  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', e => {
    if (e.matches) hide(); else show();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .catch(err => console.warn('PWA service worker registration failed:', err));
    });
  }
})();

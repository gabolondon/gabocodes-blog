// Theme toggle, search dialog, reading progress, TOC highlight, details deep links.
const root = document.documentElement;

function setTheme(t: 'light' | 'dark') {
  root.dataset.theme = t;
  try {
    localStorage.setItem('theme', t);
  } catch {
    /* storage blocked: the choice just does not persist */
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((b) =>
  b.addEventListener('click', () => {
    setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
    b.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
  }),
);

// Search (Pagefind UI, loaded on first open; it only exists in a built site)
const dlg = document.querySelector<HTMLDialogElement>('dialog.search');
let searchReady = false;
document.querySelectorAll<HTMLButtonElement>('[data-search-open]').forEach((b) =>
  b.addEventListener('click', async () => {
    if (!dlg) return;
    dlg.showModal();
    if (searchReady) return;
    searchReady = true;
    const mount = dlg.querySelector<HTMLElement>('#search-mount')!;
    try {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/pagefind/pagefind-ui.css';
      document.head.append(css);
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = '/pagefind/pagefind-ui.js';
        s.onload = () => res();
        s.onerror = () => rej(new Error('no index'));
        document.head.append(s);
      });
      // @ts-expect-error provided by pagefind-ui.js
      new window.PagefindUI({ element: mount, showImages: false, showSubResults: false });
      mount.querySelector<HTMLInputElement>('input')?.focus();
    } catch {
      mount.textContent = 'Search is available on the built site.';
    }
  }),
);
dlg?.querySelector('.close')?.addEventListener('click', () => dlg.close());
dlg?.addEventListener('click', (e) => {
  if (e.target === dlg) dlg.close();
});

// Reading progress
const bar = document.getElementById('progress-bar');
if (bar) {
  const update = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = h > 0 ? `${Math.min(100, (window.scrollY / h) * 100)}%` : '0';
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// Open <details class="uth"> when the hash targets it or something inside it
function openForHash() {
  if (!location.hash) return;
  let el: Element | null = null;
  try {
    el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  } catch {
    return;
  }
  const d = el?.closest('details');
  if (d && !d.open) {
    d.open = true;
    el?.scrollIntoView();
  }
}
openForHash();
window.addEventListener('hashchange', openForHash);

// Contents: open on desktop, collapsed on mobile
const tocDetails = document.querySelector<HTMLDetailsElement>('details.toc-d');
if (tocDetails) {
  const mq = window.matchMedia('(min-width: 901px)');
  const sync = () => (tocDetails.open = mq.matches);
  sync();
  mq.addEventListener('change', sync);
}

// Current section in the TOC
const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc li a')];
if (links.length && 'IntersectionObserver' in window) {
  const byId = new Map(links.map((a) => [decodeURIComponent(a.hash.slice(1)), a.parentElement!]));
  const heads = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          byId.forEach((li) => li.classList.remove('on'));
          byId.get(e.target.id)?.classList.add('on');
        }
      }
    },
    { rootMargin: '0px 0px -70% 0px' },
  );
  heads.forEach((h) => io.observe(h));
}

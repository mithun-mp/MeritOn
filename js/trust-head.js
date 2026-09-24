/**
 * Applies canonical URL, Open Graph URL, and document title from site-config.
 * Include in <head> after site-config.js (runs synchronously).
 */
(function () {
    if (!window.MeritOn_SITE) return;

    const page = document.documentElement.getAttribute('data-cbt-page') || MeritOn_SITE.getPageFileName();
    const meta = MeritOn_SITE.getPageMeta(page);
    const canonical = MeritOn_SITE.getCanonicalUrl(page);

    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.setAttribute('href', canonical);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', canonical);

    if (meta.title && document.title.indexOf('MeritOn') === -1) {
        document.title = meta.title;
    }
})();

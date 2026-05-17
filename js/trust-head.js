/**
 * Applies canonical URL, Open Graph URL, and document title from site-config.
 * Include in <head> after site-config.js (runs synchronously).
 */
(function () {
    if (!window.CBT_SITE) return;

    const page = document.documentElement.getAttribute('data-cbt-page') || CBT_SITE.getPageFileName();
    const meta = CBT_SITE.getPageMeta(page);
    const canonical = CBT_SITE.getCanonicalUrl(page);

    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.setAttribute('href', canonical);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', canonical);

    if (meta.title && document.title.indexOf('CBT') === -1) {
        document.title = meta.title;
    }
})();

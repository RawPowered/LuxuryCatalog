(function () {
  const toAbsoluteUrl = (maybeUrl, origin) => {
    if (!maybeUrl) return "";
    try {
      return new URL(maybeUrl, origin).toString();
    } catch {
      return "";
    }
  };

  const getUrlFromRow = (row, origin) => {
    const candidates = [
      row.querySelector("a.copy-attachment-url")?.getAttribute("data-clipboard-text"),
      row.querySelector("a.copy-attachment-url")?.getAttribute("data-url"),
      row.querySelector("a.copy-attachment-url")?.getAttribute("href"),
      row.querySelector("a[download][href*='wp-content/uploads']")?.getAttribute("href"),
      row.querySelector(".row-actions a[href*='wp-content/uploads']")?.getAttribute("href"),
      row.querySelector("a[href*='wp-content/uploads']")?.getAttribute("href")
    ];
    for (const candidate of candidates) {
      const abs = toAbsoluteUrl(candidate, origin);
      if (abs.startsWith("http")) return abs;
    }
    return "";
  };

  const parseRowsFromHtml = (html, origin) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const rows = Array.from(doc.querySelectorAll("table.wp-list-table.media tbody tr[id^='post-']"));
    const totalPagesText = doc.querySelector(".tablenav-pages .total-pages")?.textContent?.trim() || "";
    const totalPages = Number(totalPagesText || "0") || 0;
    const items = rows
      .map((row) => {
        const id = (row.id || "").replace("post-", "");
        const title = (row.querySelector(".row-title")?.textContent || "").trim();
        const url = getUrlFromRow(row, origin);
        return { id, title, url };
      })
      .filter((item) => item.url);
    return { items, totalPages };
  };

  const buildPageUrl = (baseUrl, page) => {
    const url = new URL(baseUrl);
    url.searchParams.set("mode", "list");
    url.searchParams.set("paged", String(page));
    return url.toString();
  };

  const collectAllMedia = async () => {
    const baseUrl = window.location.href;
    const origin = window.location.origin;
    const dedupe = new Set();
    const results = [];

    // First page determines total pages when available.
    const firstResponse = await fetch(buildPageUrl(baseUrl, 1), { credentials: "include" });
    const firstHtml = await firstResponse.text();
    const first = parseRowsFromHtml(firstHtml, origin);
    let totalPages = first.totalPages > 0 ? first.totalPages : 1;

    for (const item of first.items) {
      if (dedupe.has(item.url)) continue;
      dedupe.add(item.url);
      results.push(item);
    }

    // Unbounded by throttle; loops pages as fast as browser/session allows.
    for (let page = 2; page <= Math.max(totalPages, 1); page++) {
      const response = await fetch(buildPageUrl(baseUrl, page), { credentials: "include" });
      const html = await response.text();
      const parsed = parseRowsFromHtml(html, origin);
      if (parsed.totalPages > totalPages) totalPages = parsed.totalPages;
      if (parsed.items.length === 0) break;

      for (const item of parsed.items) {
        if (dedupe.has(item.url)) continue;
        dedupe.add(item.url);
        results.push(item);
      }
    }

    return {
      items: results,
      pagesScanned: totalPages,
      uniqueCount: results.length
    };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "COLLECT_MEDIA") return;
    collectAllMedia()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  });
})();

const HEADER_LINE = 'ID,Type,SKU,"GTIN, UPC, EAN, or ISBN",Name,Published,"Is featured?","Visibility in catalog","Short description",Description,"Date sale price starts","Date sale price ends","Tax status","Tax class","In stock?",Stock,"Low stock amount","Backorders allowed?","Sold individually?","Weight (lbs)","Length (in)","Width (in)","Height (in)","Allow customer reviews?","Purchase note","Sale price","Regular price",Categories,Tags,"Shipping class",Images,"Download limit","Download expiry days",Parent,"Grouped products",Upsells,Cross-sells,"External URL","Button text",Position,Brands,"Attribute 1 name","Attribute 1 value(s)","Attribute 1 visible","Attribute 1 global","Attribute 1 default","Meta: _dt_sidebar_position","Meta: _dt_sidebar_widgetarea_id","Meta: _dt_sidebar_hide_on_mobile","Meta: _dt_footer_show","Meta: _dt_footer_widgetarea_id","Meta: _dt_footer_hide_on_mobile","Meta: _dt_header_title","Meta: _dt_header_background","Meta: _dt_header_background_below_slideshow","Meta: _dt_header_transparent_bg_color_scheme","Meta: _dt_header_transparent_top_bar_bg_color","Meta: _dt_header_transparent_top_bar_bg_opacity","Meta: _dt_header_transparent_bg_color","Meta: _dt_header_transparent_bg_opacity","Meta: _dt_header_disabled_background","Meta: _dt_header_disabled_transparent_bg_color_scheme","Meta: _dt_header_disabled_transparent_top_bar_bg_color","Meta: _dt_header_disabled_transparent_top_bar_bg_opacity","Meta: _dt_header_disabled_transparent_bg_color","Meta: _dt_header_disabled_transparent_bg_opacity","Meta: _dt_page_overrides_top_margin","Meta: _dt_page_overrides_right_margin","Meta: _dt_page_overrides_bottom_margin","Meta: _dt_page_overrides_left_margin","Meta: _dt_mobile_page_padding_top","Meta: _dt_mobile_page_padding_right","Meta: _dt_mobile_page_padding_bottom","Meta: _dt_mobile_page_padding_left"';

const parseCsvLine = (line) => {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
};

const HEADERS = parseCsvLine(HEADER_LINE);
const SHORT_DESCRIPTION_TEMPLATE = `Luxurious custom cut impact resistant doors. Available in white or bronze.

<strong>Single Doors</strong>
• 30" x 80" (2'6" x 6'8")
• 32" x 80" (2'8" x 6'8")
• 36" x 80" (3'0" x 6'8")
• 36" x 84" (3'0" x 7'0")
• 36" x 96" (3'0" x 8'0")

<strong>Double Doors</strong>
• 60" x 80" (5'0" x 6'8")
• 64" x 80" (5'4" x 6'8")
• 72" x 80" (6'0" x 6'8")
• 72" x 84" (6'0" x 7'0")
• 72" x 96" (6'0" x 8'0")`;

const state = {
  mediaItems: []
};

const statusEl = document.getElementById("status");
const doorInputEl = document.getElementById("doorInput");
const collectBtn = document.getElementById("collectBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");

const setStatus = (text) => {
  statusEl.textContent = text;
};

const normalize = (value) =>
  decodeURIComponent(String(value || ""))
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "");

const getFileNameFromUrl = (url) => {
  try {
    const u = new URL(url);
    return u.pathname.split("/").pop() || "";
  } catch {
    return "";
  }
};

const detectColor = (value) => {
  const v = value.toLowerCase();
  if (v.includes("white") || /[-_]w($|[-_])/i.test(v)) return "White";
  if (v.includes("charcoal") || v.includes("bronze") || /[-_]b($|[-_])/i.test(v)) return "Bronze";
  return "";
};

const deriveSku = (fileName) =>
  fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_](scaled|edited|copy|\d+x\d+)$/i, "")
    .replace(/_white$/i, "")
    .replace(/_charcoal$/i, "")
    .replace(/_bronze$/i, "")
    .replace(/-white$/i, "")
    .replace(/-charcoal$/i, "")
    .replace(/-bronze$/i, "")
    .replace(/\s+(white|charcoal|bronze)$/i, "")
    .trim();

const detectColorNormalized = (value) => {
  const raw = detectColor(value);
  if (raw === "White") return "White";
  if (raw === "Bronze") return "Bronze";
  return "";
};

const parseDoorFilters = (raw) => {
  const values = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",")[0].trim());
  return new Set(values.map(normalize));
};

const csvEscape = (value) => {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, "\"\"")}"`;
  return str;
};

const rowsToCsv = (rows) =>
  [HEADER_LINE, ...rows.map((row) => HEADERS.map((h) => csvEscape(row[h] ?? "")).join(","))].join("\n");

const buildWooRows = (items, doorFilterSet) => {
  const rows = [];
  const urlDedupe = new Set();
  const grouped = new Map();

  for (const item of items) {
    if (!item.url || urlDedupe.has(item.url)) continue;
    urlDedupe.add(item.url);

    const fileName = getFileNameFromUrl(item.url);
    const skuBase = deriveSku(fileName || item.title || "item");
    const skuKey = normalize(skuBase);
    if (doorFilterSet.size > 0 && !doorFilterSet.has(skuKey)) continue;

    const color = detectColorNormalized(fileName || item.title || skuBase);
    if (!grouped.has(skuBase)) grouped.set(skuBase, []);
    grouped.get(skuBase).push({ item, color });
  }

  const skuOrder = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  for (const skuBase of skuOrder) {
    const entries = grouped.get(skuBase) || [];
    const colorOrder = { White: 0, Bronze: 1, "": 2 };
    entries.sort((a, b) => (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9));

    const whiteEntry = entries.find((e) => e.color === "White") || entries[0] || null;
    const bronzeEntry = entries.find((e) => e.color === "Bronze") || entries[1] || null;
    if (!whiteEntry && !bronzeEntry) continue;

    // Parent variable row (single product page by SKU).
    const parent = {};
    for (const h of HEADERS) parent[h] = "";
    parent.Type = "variable";
    parent.SKU = skuBase;
    parent.Name = skuBase;
    parent.Published = "1";
    parent["Is featured?"] = "0";
    parent["Visibility in catalog"] = "visible";
    parent["Short description"] = SHORT_DESCRIPTION_TEMPLATE;
    parent["Tax status"] = "taxable";
    parent["In stock?"] = "1";
    parent["Backorders allowed?"] = "0";
    parent["Sold individually?"] = "0";
    parent["Allow customer reviews?"] = "1";
    parent.Categories = "Doors";
    parent.Position = "0";
    parent["Attribute 1 name"] = "Color";
    parent["Attribute 1 value(s)"] = "Bronze, White";
    parent["Attribute 1 visible"] = "1";
    parent["Attribute 1 global"] = "1";
    parent["Attribute 1 default"] = "White";

    const imageUrls = [];
    if (bronzeEntry?.item?.url) imageUrls.push(bronzeEntry.item.url);
    if (whiteEntry?.item?.url) imageUrls.push(whiteEntry.item.url);
    parent.Images = imageUrls.join(", ");

    rows.push(parent);

    const pushVariation = (entry, label, position) => {
      if (!entry?.item?.url) return;
      const variation = {};
      for (const h of HEADERS) variation[h] = "";
      variation.Type = "variation";
      variation.SKU = `${skuBase}-${label}`.toUpperCase();
      variation.Name = `${skuBase} - ${label[0]}${label.slice(1).toLowerCase()}`;
      variation.Published = "1";
      variation["Is featured?"] = "0";
      variation["Visibility in catalog"] = "visible";
      variation["Short description"] = SHORT_DESCRIPTION_TEMPLATE;
      variation["Tax status"] = "taxable";
      variation["Tax class"] = "parent";
      variation["In stock?"] = "1";
      variation["Backorders allowed?"] = "0";
      variation["Sold individually?"] = "0";
      variation["Allow customer reviews?"] = "0";
      variation.Images = entry.item.url;
      variation.Parent = skuBase;
      variation.Position = String(position);
      variation["Attribute 1 name"] = "Color";
      variation["Attribute 1 value(s)"] = label[0] + label.slice(1).toLowerCase();
      variation["Attribute 1 global"] = "1";
      rows.push(variation);
    };

    // Match LUX-115 pattern: Bronze row first, White row second.
    pushVariation(bronzeEntry, "BRONZE", 1);
    pushVariation(whiteEntry, "WHITE", 2);
  }

  return rows;
};

const sendCollectMessage = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  const tabUrl = tab.url || "";
  if (!/\/wp-admin\/upload\.php/i.test(tabUrl)) {
    throw new Error("Active tab is not WordPress Media Library list view (/wp-admin/upload.php).");
  }

  const trySend = async () => chrome.tabs.sendMessage(tab.id, { type: "COLLECT_MEDIA" });

  try {
    const response = await trySend();
    if (!response?.ok) throw new Error(response?.error || "Collect failed.");
    return response.data;
  } catch (error) {
    const msg = String(error?.message || error || "");
    if (!msg.includes("Receiving end does not exist")) throw error;

    // Fallback: inject collector script into current tab, then retry.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    const response = await trySend();
    if (!response?.ok) throw new Error(response?.error || "Collect failed after script injection.");
    return response.data;
  }
};

const downloadCsv = (csvText) => {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `woo-media-mapped-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

collectBtn.addEventListener("click", async () => {
  try {
    setStatus("Collecting media URLs from all pages...");
    const data = await sendCollectMessage();
    state.mediaItems = data.items || [];
    await chrome.storage.local.set({ wpMediaItems: state.mediaItems });
    setStatus(`Collected ${data.uniqueCount} unique URLs across ~${data.pagesScanned} page(s).`);
  } catch (error) {
    setStatus(`Collect failed: ${error.message || error}`);
  }
});

exportBtn.addEventListener("click", async () => {
  try {
    if (state.mediaItems.length === 0) {
      const saved = await chrome.storage.local.get(["wpMediaItems"]);
      state.mediaItems = saved.wpMediaItems || [];
    }
    if (state.mediaItems.length === 0) {
      setStatus("No collected media. Run 'Collect All Media URLs' first.");
      return;
    }

    const doorFilterSet = parseDoorFilters(doorInputEl.value);
    const rows = buildWooRows(state.mediaItems, doorFilterSet);
    if (rows.length === 0) {
      setStatus("No rows matched. Check your door SKU filters.");
      return;
    }

    const csv = rowsToCsv(rows);
    downloadCsv(csv);
    setStatus(`Exported ${rows.length} row(s). No duplicate URLs included.`);
  } catch (error) {
    setStatus(`Export failed: ${error.message || error}`);
  }
});

clearBtn.addEventListener("click", async () => {
  state.mediaItems = [];
  doorInputEl.value = "";
  await chrome.storage.local.remove(["wpMediaItems"]);
  setStatus("Cleared.");
});

/** Catalog PDF export layout and branding constants. Generation logic lives in App orchestrator. */
export {
  COMPANY_NAME,
  CATALOG_TITLE,
  CATALOG_FILENAME,
  CONTACT_LINE,
  FOOTER_TEXT,
} from './catalogBranding';

export const PDF_PAGE_FORMAT = 'letter' as const;
export const PDF_ORIENTATION = 'portrait' as const;
export const SPREAD_INTERVAL_SKUS = 10;

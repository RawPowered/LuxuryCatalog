/** Publish-safe catalog branding (client names redacted). */
export const COMPANY_NAME = 'LUX Door Co';
export const CATALOG_TITLE = '2026 Product Catalog';
export const CATALOG_FILENAME = 'LUX_Catalog_2026.pdf';
export const CONTACT_LINE = '100 Design Boulevard, Sample City, FL 33000 | (555) 000-0000 | www.example-doors.com';
export const FOOTER_TEXT = `${COMPANY_NAME} 2026`;
export const SKU_PREFIX = 'LUX';

/** Normalize alphabetic source SKU prefixes to publish-safe LUX- form. */
export const sanitizeSkuForPublish = (sku: string): string =>
  sku.replace(/^[A-Za-z]{2,8}(?=-?\d)/, SKU_PREFIX);

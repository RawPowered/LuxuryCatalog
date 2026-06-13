export const getBaseSku = (filename: string) => {
  let base = filename.replace(/\.[^/.]+$/, '');
  base = base
    .replace(/_white$/i, '')
    .replace(/_charcoal$/i, '')
    .replace(/_bronze$/i, '')
    .replace(/-white$/i, '')
    .replace(/-charcoal$/i, '')
    .replace(/-bronze$/i, '')
    .replace(/ white$/i, '')
    .replace(/ charcoal$/i, '')
    .replace(/ bronze$/i, '')
    .replace(/_w$/i, '')
    .replace(/_b$/i, '')
    .replace(/-w$/i, '')
    .replace(/-b$/i, '')
    .replace(/ w$/i, '')
    .replace(/ b$/i, '');
  return base.trim();
};

export const normalizeFileName = (name: string) => {
  let normalized = name.replace(/^([a-zA-Z]+)[\s_-]*(\d+)/, (match, p1, p2) => `${p1.toUpperCase()}-${p2}`);
  normalized = normalized.replace(/[\s_-]*(white|charcoal|bronze)(?=\.[^.]+$|$)/i, '');
  normalized = normalized.replace(/[\s_-]+(w|b)(?=\.[^.]+$|$)/i, '');
  return normalized;
};

export const detectColorFromFileName = (name: string): 'white' | 'charcoal' | null => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('white')) return 'white';
  if (lowerName.includes('charcoal') || lowerName.includes('bronze')) return 'charcoal';
  if (/[-_\s]w(?=\.[^.]+$|$)/i.test(name)) return 'white';
  if (/[-_\s]b(?=\.[^.]+$|$)/i.test(name)) return 'charcoal';
  return null;
};

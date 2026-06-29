// Tiny DOM construction helpers shared by the popup renderers.

export function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function cell(tag: 'td' | 'th', text: string, span = 1, cls = ''): HTMLTableCellElement {
  const c = document.createElement(tag);
  c.textContent = text;
  if (span > 1) c.colSpan = span;
  if (cls) c.className = cls;
  return c;
}

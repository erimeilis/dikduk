export function replaceInTextField(
  field: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number,
  replacement: string,
): void {
  const v = field.value;
  field.value = v.slice(0, start) + replacement + v.slice(end);
  const caret = start + replacement.length;
  field.setSelectionRange(caret, caret);
  field.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

export function replaceInRange(range: Range, replacement: string): void {
  range.deleteContents();
  const node = document.createTextNode(replacement);
  range.insertNode(node);

  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const after = document.createRange();
    after.setStartAfter(node);
    after.collapse(true);
    sel.addRange(after);
  }

  const host =
    (node.parentElement?.closest('[contenteditable]') as HTMLElement | null) ??
    node.parentElement;
  host?.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

// Pure character-offset <-> (text node, offset) walking over a host element's
// text content. No chrome.*, no extension state — shared by the content-world
// SpellController (editable-locator) and the MAIN-world highlight installer.

export interface TextOffset {
  node: Text;
  offset: number;
}

export interface OffsetSpan {
  start: number;
  end: number;
}

// Resolve a character offset (counted across the host's text nodes in document
// order) to the text node + local offset that contains it.
export function locateTextOffset(host: Node, offset: number): TextOffset | null {
  const doc = host.ownerDocument ?? document;
  const walker = doc.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode() as Text | null;

  while (node) {
    const length = node.data.length;
    if (offset <= seen + length) return { node, offset: offset - seen };
    seen += length;
    node = walker.nextNode() as Text | null;
  }

  return null;
}

// Build a Range spanning [start, end) character offsets within the host, or null
// if either endpoint cannot be resolved.
export function rangeFromOffsets(host: HTMLElement, start: number, end: number): Range | null {
  const a = locateTextOffset(host, start);
  const b = locateTextOffset(host, end);
  if (!a || !b) return null;

  const range = (host.ownerDocument ?? document).createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

// Build one Range per resolvable offset span; spans that cannot be resolved are
// skipped.
export function rangesForOffsets(host: HTMLElement, spans: OffsetSpan[]): Range[] {
  const ranges: Range[] = [];
  for (const span of spans) {
    const range = rangeFromOffsets(host, span.start, span.end);
    if (range) ranges.push(range);
  }
  return ranges;
}

import type { Root, Element } from 'hast';
import { visit } from 'unist-util-visit';

const NUMERIC = /^[\s\d.,/→%+\-–×x~<>≈]*\d[\s\d.,/→%+\-–×x~<>≈]*(ms|s|min|h|MB|GB|KB|%)?$/;

const textOf = (n: Element): string =>
  n.children.map((c) => (c.type === 'text' ? c.value : c.type === 'element' ? textOf(c) : '')).join('');

/** Marks numeric table cells so they render in mono. */
export function rehypeDataTable() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'td') return;
      if (NUMERIC.test(textOf(node).trim())) {
        const cls = node.properties?.className;
        node.properties = { ...node.properties, className: [...(Array.isArray(cls) ? cls : []), 'n'] };
      }
    });
  };
}

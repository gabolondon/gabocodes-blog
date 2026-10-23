import type { Root, RootContent, Heading } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';

const PREFIX = /^under the hood:/i;

type Part = {
  type: 'uthPart';
  data: { hName: string; hProperties?: Record<string, unknown> };
  children: unknown[];
};

const part = (hName: string, children: unknown[], hProperties?: Record<string, unknown>): Part => ({
  type: 'uthPart',
  data: { hName, hProperties },
  children,
});
const text = (value: string) => ({ type: 'text', value });

export function countCodeLines(nodes: RootContent[]): number {
  let n = 0;
  for (const node of nodes) {
    visit(node as unknown as Root, 'code', (c: { value: string }) => {
      n += c.value.length === 0 ? 0 : c.value.split('\n').length;
    });
  }
  return n;
}

/**
 * Turns each `### Under the hood: …` h3, plus everything up to the next h2/h3, into
 * <details class="uth">. The h3 stays inside <summary> so Astro still gives it an id (deep links, TOC).
 */
export function remarkUnderTheHood() {
  return (tree: Root) => {
    const out: RootContent[] = [];
    const kids = tree.children;
    let i = 0;
    while (i < kids.length) {
      const node = kids[i]!;
      if (node.type === 'heading' && node.depth === 3 && PREFIX.test(toString(node))) {
        let j = i + 1;
        while (j < kids.length) {
          const k = kids[j]!;
          if (k.type === 'heading' && k.depth <= 3) break;
          j++;
        }
        const body = kids.slice(i + 1, j);
        const lines = countCodeLines(body);
        const label = lines === 1 ? '1 line of code' : `${lines} lines of code`;
        const summary = part('summary', [
          part('span', [node as Heading], { class: 'uth-title' }),
          part('span', [text('skip this if you lead a team')], { class: 'uth-skip' }),
          part('span', [text(lines > 0 ? `open · ${label}` : 'open')], { class: 'uth-open' }),
          part('span', [text('close')], { class: 'uth-close' }),
        ]);
        const details = part('details', [summary, part('div', body as unknown[], { class: 'uth-body' })], {
          class: 'uth',
        });
        out.push(details as unknown as RootContent);
        i = j;
      } else {
        out.push(node);
        i++;
      }
    }
    tree.children = out;
  };
}

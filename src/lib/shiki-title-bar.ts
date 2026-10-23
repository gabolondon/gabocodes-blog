import type { ShikiTransformer } from 'shiki';

/** Adds a filename bar to ```lang title="path"``` code blocks. */
export function shikiTitleBar(): ShikiTransformer {
  return {
    name: 'title-bar',
    pre(node) {
      const raw = (this.options.meta as { __raw?: string } | undefined)?.__raw ?? '';
      const m = raw.match(/title="([^"]+)"/);
      if (!m) return;
      node.properties['data-titled'] = '';
      node.children.unshift({
        type: 'element',
        tagName: 'div',
        properties: { class: 'fn' },
        children: [
          { type: 'element', tagName: 'span', properties: {}, children: [{ type: 'text', value: m[1]! }] },
          {
            type: 'element',
            tagName: 'span',
            properties: { class: 'note' },
            children: [{ type: 'text', value: 'example code, not the production implementation' }],
          },
        ],
      });
    },
  };
}

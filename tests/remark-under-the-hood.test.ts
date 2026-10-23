import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { remarkUnderTheHood, countCodeLines } from '../src/lib/remark-under-the-hood.ts';
import { runCommands } from '../src/lib/run-commands.ts';
import type { Root } from 'mdast';

const run = (md: string): Root => {
  const t = unified().use(remarkParse).parse(md);
  remarkUnderTheHood()(t);
  return t;
};
const parts = (t: Root) =>
  t.children as unknown as { type: string; data?: { hName: string; hProperties?: any }; children: any[] }[];

const doc = [
  '## One', '', 'intro', '',
  '### Under the hood: the cache', '', 'text', '',
  '```py title="a.py"', 'a = 1', 'b = 2', '```', '',
  '```py', 'c = 3', '```', '',
  '## Two', '', 'after', '',
  '### Under the hood: second', '', '```sh', 'x', '```', '',
  '### Plain h3', '', 'kept',
].join('\n');

describe('remarkUnderTheHood', () => {
  const kids = parts(run(doc));

  it('wraps each Under the hood h3 in details and leaves the rest alone', () => {
    const names = kids.map((k) => k.data?.hName ?? k.type);
    expect(names).toEqual(['heading', 'paragraph', 'details', 'heading', 'paragraph', 'details', 'heading', 'paragraph']);
  });

  it('stops at the next h2', () => {
    expect(kids[2]!.children[1].children.map((c: any) => c.type)).toEqual(['paragraph', 'code', 'code']);
  });

  it('stops at the next h3', () => {
    expect(kids[5]!.children[1].children).toHaveLength(1);
  });

  it('counts lines of code and pluralises', () => {
    const open = (k: any) => k.children[0].children[2].children[0].value;
    expect(open(kids[2])).toBe('open · 3 lines of code');
    expect(open(kids[5])).toBe('open · 1 line of code');
  });

  it('keeps the h3 inside the summary so it still gets an id', () => {
    const title = kids[2]!.children[0].children[0].children[0];
    expect(title.type).toBe('heading');
    expect(title.depth).toBe(3);
  });

  it('is closed by default', () => {
    expect(kids[2]!.data!.hProperties.open).toBeUndefined();
  });

  it('countCodeLines ignores empty blocks', () => {
    expect(countCodeLines([{ type: 'code', value: '' } as any])).toBe(0);
  });

  it('matches case-insensitively and ignores near misses', () => {
    expect(parts(run('### under the hood: lower\n\n```x\n1\n```'))[0]!.data?.hName).toBe('details');
    expect(parts(run('### Under the hoodie\n\ntext'))[0]!.type).toBe('heading');
  });
});

describe('runCommands', () => {
  it('reads the first block under Run it yourself', () => {
    const md = '## A\n\n```\nno\n```\n\n## Run it yourself\n\n```sh\n$ git clone x\n# c\nmake demo\n```\n\n## B';
    expect(runCommands(md)).toEqual(['git clone x', 'make demo']);
  });
  it('returns [] without the section', () => {
    expect(runCommands('## A\n\ntext')).toEqual([]);
  });
});

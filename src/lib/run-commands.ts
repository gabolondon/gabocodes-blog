/** First lines of the first code block under the "Run it yourself" h2. */
export function runCommands(body: string | undefined, max = 4): string[] {
  if (!body) return [];
  const sec = body.split(/^## Run it yourself\s*$/im)[1];
  if (!sec) return [];
  const block = sec.split(/^## /m)[0]!.match(/```[^\n]*\n([\s\S]*?)```/);
  if (!block) return [];
  return block[1]!
    .split('\n')
    .map((l) => l.replace(/^\$\s*/, '').trimEnd())
    .filter((l) => l && !l.startsWith('#'))
    .slice(0, max);
}

import type { BunFile } from 'bun';
import type { Node } from 'jsonc-parser';
import { getLocation, parseTree, visit } from 'jsonc-parser';

const indent_width = 2;

const print_width = 100;

export const writeln = async (str: string, target?: BunFile) => (
  await Bun.write(target || Bun.stdout, `${str}\n`)
);

export const map = (arr: any[], callback: (item: any) => any) => {
  if (!arr) return [];
  const n = arr.length;
  for (let i = 0; i < n; ++i) arr[i] = callback(arr[i]);
  return arr;
};

export const format = (json: string) => {
  if (!(json = json?.trim())) return '';
  const lines = json.split(/\r?\n/);
  const prepend: string[] = [];
  const comments = new Map<string, string>();
  if (json.includes('//') || json.includes('/*')) {
    visit(json, {
      onComment(offset, len, line) {
        const comment = json.slice(offset, offset + len).trim();
        const { path } = getLocation(json, offset);
        if (!path.length) prepend.push(comment);
        else {
          const key = `"${Bun.hash(comment)}"`;
          const pad = indent(path.length);
          const multiline = map(comment.split(/\r?\n/), (str) => `${pad}${str.trim()}`);
          const entry = `${pad}${key}: ${key},`;
          comments.set(entry, multiline.join('\n'));
          lines.splice(line, multiline.length, entry);
        }
      },
    });
  }

  const ast = parseTree(lines.join('\n'))!;
  let result = formatNode(ast, 0, `${prepend.join('\n')}${prepend.length ? '\n' : ''}`);
  for (const [id, comment] of comments) result = result.replace(id, comment);
  return result;
};

const indent = (i: number) => ' '.repeat(Math.max(0, i) * indent_width);

const formatNode = (
  ast: Node,
  level = 0,
  data = '',
  type = ast?.value ? 'value' : ast?.type,
): string => ({
  value() {
    let value = ast.value;
    ast.type === 'string' && (value = `"${value}"`);
    return data + value;
  },
  property() {
    const [{ value = '' } = {}, child] = ast.children!;
    data += `${indent(level)}"${value}": `;
    return formatNode(child, level, data);
  },
  object() {
    data += '{\n';
    data += map(ast.children!, (child) => formatNode(child, level + 1)).join(',\n');
    return `${data}\n${indent(level)}}`;
  },
  array() {
    const [i, div] = ast.parent!.length > print_width ? [level, '\n'] : [-1, ''];
    const [pad, sep] = [indent(i + 1), `,${div || ' '}`];
    data += `[${div}`;
    data += map(ast.children!, (child) => `${pad}${formatNode(child, level + 1)}`).join(sep);
    return `${data}${div}${indent(i)}]`;
  },
}[type as 'value']?.() ?? (() => {
  const cause = { ast, level, data };
  throw new Error('Invalid JSON', { cause });
})());

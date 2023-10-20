import type { BunFile } from 'bun';
import type { Node } from 'jsonc-parser';
import { getLocation, parseTree, visit } from 'jsonc-parser';

const indent_width = 2;

const print_width = 100;

const indent = (i: number) => ' '.repeat(Math.max(0, i) * indent_width);

export const writeln = async (str: string, target: BunFile = Bun.stdout) => (
  await Bun.write(target, `${str}\n`) as unknown as void
);

export const popItem = <T>(arr: T[], item: T) => {
  const found = arr.indexOf(item);
  if (!(~found)) return;
  arr.splice(found, 1);
  return item;
};

export const map = <T, Init extends any[]>(arr: Init, callback: (item: Init[number]) => T) => {
  if (!arr?.length) return [];
  const n = arr.length;
  for (let i = 0; i < n; ++i) arr[i] = callback(arr[i]);
  return arr as T[];
};

export const format = (json: string) => {
  if (!(json = json?.trim())) return '';
  const prepend: string[] = [];
  const lines = json.split(/\r?\n/);
  const comments = new Map<string, string>();
  if (json.includes('//') || json.includes('/*')) {
    visit(json, {
      onComment(offset, len, line) {
        const comment = json.slice(offset, offset + len).trim();
        const { path } = getLocation(json, offset);
        if (!path.length) prepend.push(comment);
        else {
          const pad = indent(path.length);
          const hash = `"${Bun.hash(comment)}"`;
          const entry = `${pad}${hash}: ${hash},`;
          const multiline = map(comment.split(/\r?\n/), (str) => `${pad}${str.trim()}`);
          comments.set(entry, multiline.join('\n'));
          lines.splice(line, multiline.length, entry);
        }
      },
    });
  }

  const ast = parseTree(lines.join('\n'))!;
  prepend.length && prepend.push('');
  let result = formatNode(ast, prepend.join('\n'));
  for (const [id, comment] of comments) result = result.replace(id, comment);
  return result;
};

const formatNode = (
  ast: Node,
  data = '',
  level = 0,
  type = ast?.value ? 'value' : ast?.type,
) => ({
  value() {
    let value = ast.value;
    ast.type === 'string' && (value = `"${value}"`);
    return `${data}${value}`;
  },
  property() {
    const [{ value: prop }, child] = ast.children!;
    data += `${indent(level)}"${prop}": `;
    return formatNode(child, data, level);
  },
  object() {
    data += '{\n';
    data += map(ast.children!, (child) => formatNode(child, '', level + 1)).join(',\n');
    return `${data}\n${indent(level)}}`;
  },
  array() {
    const [i, div] = ast.parent!.length > print_width ? [level, '\n'] : [-1, ''];
    const [pad, sep] = [indent(i + 1), `,${div || ' '}`];
    data += `[${div}`;
    data += map(ast.children!, (child) => formatNode(child, pad, level + 1)).join(sep);
    return `${data}${div}${indent(i)}]`;
  },
}[type as 'value']?.() ?? (() => {
  const cause = { ast, data, level };
  throw new Error('Invalid JSON', { cause });
})());

import type { BunFile } from 'bun';
import { getLocation, type Node, parseTree, visit } from 'jsonc-parser';

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

  prepend.length && prepend.push('');
  const ast = parseTree(lines.join('\n'))!;
  let result = formatNode(ast, prepend.join('\n'));
  if (result == null) return Promise.reject(new Error(`Invalid JSON ${json}`));
  for (const [id, comment] of comments) result = result.replace(id, comment);
  return result;
};

const formatNode = (ast: Node, data = '', level = 0): string => ({
  ['value' as string]: () => `${data}${JSON.stringify(ast.value)}`,
  property() {
    const [{ value: prop }, child] = ast?.children || [{} as never];
    data += `${indent(level)}"${prop}": `;
    return formatNode(child, data, level);
  },
  array() {
    (ast as any).parent ??= { length: +!!ast.children?.length + print_width };
    const singleLine = ast.parent!.length < print_width || (ast.children?.length ?? 0) < 2;
    const [i, div] = singleLine ? [-1, ''] : [level, '\n'];
    const [pad, sep] = [indent(i + 1), `,${div || ' '}`];
    data += `[${div}`;
    data += map(ast?.children!, (child) => formatNode(child, pad, level + 1)).join(sep);
    return `${data}${div}${indent(i)}]`;
  },
  object() {
    if (!ast.children?.length) return `${data}{}`;
    else if (ast.parent && ast.children.length < 3 && ast.length < print_width) {
      return `${data}{ ${map(ast.children, formatNode).join(', ')} }`;
    }

    data += '{\n';
    data += map(ast.children!, (child) => formatNode(child, '', level + 1)).join(',\n');
    return `${data}\n${indent(level)}}`;
  },
}['value' in (ast || {}) ? 'value' : ast?.type]?.());

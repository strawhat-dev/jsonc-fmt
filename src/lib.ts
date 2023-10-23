import type { BunFile } from 'bun';
import { getLocation, type Node, parseTree, visit } from 'jsonc-parser';
import memo from 'memoize-one';

const indent_width = 2;

const print_width = 100;

const indent = memo((i: number) => ' '.repeat(Math.max(0, i) * indent_width));

export const writeln = async (str: string, target: BunFile = Bun.stdout) => (
  await Bun.write(target, `${str}\n`) as unknown as void
);

export const popItem = <T>(arr: T[], item: T) => {
  const found = arr.indexOf(item);
  return arr.splice(found, !!~found as never).pop();
};

export const map = <T, Init extends any[]>(arr: Init, callback: (item: Init[number]) => T) => {
  if (!arr?.length) return [];
  const n = arr.length;
  for (let i = 0; i < n; ++i) arr[i] = callback(arr[i]);
  return arr as T[];
};

export const format = (json: string) => {
  if (!(json = json?.trim())) return '';
  let prepend: string[], comments: Map<string, string>;
  if (/(^|\s)((\/\/)|(\/\*))/.test(json)) {
    const lines = json.split(/\r?\n/);
    visit(json, {
      onComment(offset, len, startline) {
        const comment = json.slice(offset, offset + len).trim();
        const { path } = getLocation(json, offset);
        if (!path.length) (prepend ??= []).push(comment);
        else {
          const pad = indent(path.length);
          const hash = `"${Bun.hash(comment)}"`;
          const entry = `${pad}${hash}: ${hash},`;
          const multiline = map(comment.split(/\r?\n/), (str) => `${pad}${str.trim()}`);
          (comments ??= new Map()).set(entry, multiline.join('\n'));
          lines.splice(startline, multiline.length, entry);
        }
      },
    });

    json = lines.join('\n');
    prepend! && prepend.push('');
  }

  let result = formatNode(parseTree(json)!, prepend!?.join('\n'));
  if (result == null) return Promise.reject(new Error(`Invalid JSON: ${json}`));
  if (comments!) for (const [id, comment] of comments) result = result.replace(id, comment);
  return result;
};

const equals = (a: any, b: any) => {
  if (!a || typeof a !== 'object') return a === b;
  if (!b || typeof b !== 'object') return a === b;
  let parent, offset, colonOffset;
  void parent, offset, colonOffset;
  ({ parent, offset, colonOffset, ...a } = a);
  ({ parent, offset, colonOffset, ...b } = b);
  return Bun.deepEquals(a, b);
};

const formatNode = memo((ast: Node, data = '', level = 0): string => ({
  ['value' as string]: () => `${data}${JSON.stringify(ast.value)}`,
  property() {
    const [{ value: key }, child] = ast?.children || [{}];
    data += `${indent(level)}"${key}": `;
    return formatNode(child as Node, data, level);
  },
  array() {
    (ast as any).children ??= [];
    (ast as any).parent ??= { length: +!!ast.children!.length + print_width };
    const singleLine = ast.parent!.length < print_width || ast.children!.length < 2;
    const [i, div] = singleLine ? [-1, ''] : [level, '\n'];
    const [pad, sep] = [indent(i + 1), `,${div || ' '}`];
    data += `[${div}`;
    data += map(ast?.children!, (child) => formatNode(child, pad, level + 1)).join(sep);
    return `${data}${div}${indent(i)}]`;
  },
  object() {
    if (!ast.children?.length) return `${data}{}`;
    if (ast.parent && ast.children.length < 3 && ast.length < print_width) {
      return `${data}{ ${map(ast.children, formatNode).join(', ')} }`;
    }

    data += '{\n';
    data += map(ast.children!, (child) => formatNode(child, '', level + 1)).join(',\n');
    return `${data}\n${indent(level)}}`;
  },
}['value' in (ast || {}) ? 'value' : ast?.type]?.()), equals);

#!/usr/bin/env bun
import { isatty } from 'tty';
import { resolve } from 'path';
import { format, map, writeln } from './lib';

export default format;

if (resolve(process.argv0) === resolve(import.meta.file)) {
  if (!isatty(0)) Bun.stdin.text().then(format).then(writeln);
  else {
    const args = process.argv.slice(2);
    const tail = args.length - 1;
    const write = (({ '-1': () => false, 0: () => args.shift(), [tail]: () => args.pop() })[
      args.findIndex((arg) => arg === '-w') as 0
    ])?.();

    for (const file of map(args, Bun.file)) {
      const handle = (contents: string) => writeln(contents, write && file);
      file.text().then(format).then(handle);
    }
  }
}

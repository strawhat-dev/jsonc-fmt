#!/usr/bin/env bun
import { isatty } from 'tty';
import { type BunFile, readableStreamToText } from 'bun';
import { format, map, popItem, writeln } from './lib';

if (!isatty(0)) readableStreamToText(Bun.stdin.stream()).then(format).then(writeln);
else {
  const args = process.argv.slice(2);
  const debug = popItem(args, '-d');
  const write = popItem(args, '-w') && !debug;
  let [total, start] = [0, +!debug || Bun.nanoseconds()];
  const handle = (file: BunFile) => async (out: string) => {
    if (debug) {
      const ellapsed = (Bun.nanoseconds() - start) / 1_000_000;
      out = `formatted ${file.name} in ${ellapsed} ms`;
      (total += ellapsed), (start = Bun.nanoseconds());
    }

    if (!write) file = Bun.stdout;
    else if (!(await file.exists())) {
      return Promise.reject(
        new Error('Invalid file(s) provided in write mode.', {
          cause: { file: file.name, args },
        })
      );
    }

    return writeln(out, file);
  };

  for (const file of map(args, Bun.file)) await file.text().then(format).then(handle(file));
  total && writeln(`formatted ${args.length} file${args.length > 1 ? 's' : ''} in ${total} ms`);
}

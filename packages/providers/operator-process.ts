import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// This runs our fixed operator script, never an executable or shell supplied by a shopper.
export async function boundedOperatorCommand(file: string, args: string[], signal: AbortSignal) {
  const run = promisify(execFile)(file, args, {
    timeout: 330000,
    signal,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  run.child.stdin?.end();
  return run;
}

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// A print-mode CLI may read redirected input until EOF even when -p is supplied.
// Close stdin immediately: leaving Node's default pipe open can stall the whole run.
export async function boundedAgentProcess(
  file: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout: number;
  },
) {
  const running = promisify(execFile)(file, args, {
    ...options,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  running.child.stdin?.end();
  return running;
}

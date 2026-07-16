// stdin.ts — read the raw hook payload from stdin.
//
// Claude Code feeds the PreToolUse payload on STDIN as JSON. We also accept an
// ADD_REASONING_TO_PRS_HOOK_INPUT env var as a test/dev fallback. A TTY (no piped input)
// resolves to '' rather than hanging, and any read error degrades to whatever was read so
// far — never throws (the parse layer then yields no injection).

export async function readRawStdin(
  env: NodeJS.ProcessEnv = process.env,
  stdin: NodeJS.ReadStream = process.stdin,
): Promise<string> {
  const fromEnv = env.ADD_REASONING_TO_PRS_HOOK_INPUT;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  if (stdin.isTTY) return '';
  return new Promise<string>((resolve) => {
    let data = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk) => (data += chunk));
    stdin.on('end', () => resolve(data));
    stdin.on('error', () => resolve(data));
  });
}

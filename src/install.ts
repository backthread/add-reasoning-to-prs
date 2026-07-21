// install.ts — `npx add-reasoning-to-prs` (the bare command) installs the hook into the
// user's Claude Code settings.
//
// The Claude Code PLUGIN (marketplace) is the recommended install — it registers the hook
// from the plugin manifest with no settings mutation, running the committed bundle via
// ${CLAUDE_PLUGIN_ROOT}. This path is the alternative for non-plugin users: because the
// hook is SYNCHRONOUS (a PreToolUse decision), it must not pay npm-resolve latency on
// every Bash call — so instead of an `npx …` hook command, we COPY the self-contained,
// zero-dependency bundle to a stable location and point the settings.json hook at it with
// plain `node`.

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, copyFile, chmod } from 'node:fs/promises';

export interface InstallDeps {
  env?: NodeJS.ProcessEnv;
  /** The bundle to copy. Defaults to this running bin (the bundle itself under npx). */
  sourceBinPath?: string;
  /** Where human-readable output goes. Defaults to stdout. */
  log?: (msg: string) => void;
}

export const HOSTED_NOTICE = `Your agent now writes the "why" into every PR — locally, on your own model, free.
Want the team view — the why pushed to you and searchable across your whole codebase?
  → https://backthread.dev   (the hosted upgrade)`;

function claudeDir(env: NodeJS.ProcessEnv): string {
  const override = env.CLAUDE_CONFIG_DIR;
  return override && override.trim().length > 0 ? override : join(homedir(), '.claude');
}

function settingsPath(env: NodeJS.ProcessEnv): string {
  return join(claudeDir(env), 'settings.json');
}

function installDir(env: NodeJS.ProcessEnv): string {
  const override = env.ADD_REASONING_TO_PRS_STATE_DIR;
  const base = override && override.trim().length > 0 ? override : join(homedir(), '.add-reasoning-to-prs');
  return join(base, 'bin');
}

export function installedBinPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(installDir(env), 'add-reasoning-to-prs.js');
}

/** True if some PreToolUse entry already runs our hook (idempotency). */
function alreadyInstalled(preToolUse: unknown): boolean {
  if (!Array.isArray(preToolUse)) return false;
  return preToolUse.some(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      Array.isArray((entry as { hooks?: unknown }).hooks) &&
      (entry as { hooks: unknown[] }).hooks.some(
        (h) =>
          h &&
          typeof h === 'object' &&
          typeof (h as { command?: unknown }).command === 'string' &&
          (h as { command: string }).command.includes('add-reasoning-to-prs'),
      ),
  );
}

/**
 * Merge the PreToolUse/Bash hook into settings.json. Returns 'added', 'present' (already
 * installed), or 'skipped-unparseable' (existing settings.json isn't valid JSON — we do
 * NOT clobber it). Never throws.
 */
async function mergeHook(
  env: NodeJS.ProcessEnv,
  binPath: string,
): Promise<'added' | 'present' | 'skipped-unparseable'> {
  const path = settingsPath(env);
  let raw: string | null = null;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    raw = null; // absent → we'll create it
  }

  let settings: Record<string, unknown> = {};
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      settings = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return 'skipped-unparseable'; // never overwrite a file we can't parse
    }
  }

  const hooks = (settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {}) as Record<
    string,
    unknown
  >;
  const preToolUse = Array.isArray(hooks.PreToolUse) ? (hooks.PreToolUse as unknown[]) : [];
  if (alreadyInstalled(preToolUse)) return 'present';

  preToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: `node ${JSON.stringify(binPath)} hook` }],
  });
  hooks.PreToolUse = preToolUse;
  settings.hooks = hooks;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2) + '\n');
  return 'added';
}

/** Install the hook. Copies the bundle to a stable path, merges the settings.json hook,
 * prints a summary + the hosted-version note. Returns an exit code (0 on success). */
export async function runInstall(deps: InstallDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((m: string) => process.stdout.write(m + '\n'));
  const source = deps.sourceBinPath ?? fileURLToPath(import.meta.url);

  try {
    // 1. Copy the self-contained bundle to a stable location.
    const dest = installedBinPath(env);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(source, dest);
    await chmod(dest, 0o755).catch(() => {});

    // 2. Merge the hook into settings.json.
    const result = await mergeHook(env, dest);

    if (result === 'skipped-unparseable') {
      log(`Your ${settingsPath(env)} is not valid JSON, so it was left untouched.`);
      log('Fix it (or remove it) and re-run, or install the Claude Code plugin instead.');
      return 1;
    }
    log(
      result === 'added'
        ? 'Installed the add-reasoning-to-prs hook into Claude Code.'
        : 'add-reasoning-to-prs is already installed — settings unchanged.',
    );
    log(`  Hook: PreToolUse (Bash) → node ${dest} hook`);
    log(`  Disable per repo: git config add-reasoning-to-prs.disabled true`);
    log('');
    log(HOSTED_NOTICE);
    return 0;
  } catch (e) {
    log(`Install failed: ${(e as Error).message}`);
    log('You can also install the Claude Code plugin from the marketplace instead.');
    return 1;
  }
}

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildResult, collectAliases, entryToSql, slugFromLocation, shouldRetryStatus, backoffMs } from './scrape-lib';

const UA = 'Mozilla/5.0 (compatible; DikDuk/1.0; +https://github.com/erimeilis/dikduk)';
// fileURLToPath (not `new URL(...).pathname`) so paths with spaces aren't percent-encoded.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CHECKPOINT = join(SCRIPT_DIR, '.pealim-scrape-checkpoint.json');
const MAX_RETRIES = 8; // ~ up to backoffMs cap of 10 min per id before giving up

/** Parses a required-numeric CLI flag; throws with a clear message on NaN/empty rather than
 * silently propagating NaN (e.g. an empty `--delay=` must not become `sleep(NaN)`, which
 * resolves immediately and silently drops the politeness delay). */
function numericFlag(args: Map<string, string>, name: string, fallback: number): number {
  const raw = args.get(name);
  if (raw === undefined) return fallback;
  if (raw.trim() === '') throw new Error(`--${name} requires a value (got empty string)`);
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`--${name} must be a number, got "${raw}"`);
  return n;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchEntry(id: number): Promise<{ slug: string; html: string } | null> {
  const head = await fetch(`https://www.pealim.com/dict/${id}/`, {
    headers: { 'User-Agent': UA }, redirect: 'manual',
  });
  if (head.status === 404) return null;
  if (head.status !== 302) {
    if (shouldRetryStatus(head.status)) throw new Error(`retryable status ${head.status}`);
    return null;
  }
  const slug = slugFromLocation(head.headers.get('location') ?? '');
  if (!slug) return null;
  const page = await fetch(`https://www.pealim.com/dict/${id}-${slug}/`, { headers: { 'User-Agent': UA } });
  if (!page.ok) {
    if (shouldRetryStatus(page.status)) throw new Error(`retryable status ${page.status}`);
    return null;
  }
  return { slug, html: await page.text() };
}

function d1Exec(sql: string): void {
  const file = join(SCRIPT_DIR, '.pealim-scrape-batch.sql');
  writeFileSync(file, sql);
  // -y: answer wrangler's "DB will be unavailable, proceed?" prompt automatically,
  // so an unattended multi-hour run doesn't hang on every batch flush.
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'pealim', '--remote', '-y', `--file=${file}`], { stdio: 'inherit' });
  rmSync(file);
}

async function main() {
  const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
  const delaySec = numericFlag(args, 'delay', 10);
  const delay = delaySec * 1000;
  const stopAfter = numericFlag(args, 'stop-after', 50);
  // Each entry emits an upsert + ~27 alias inserts + N see_also inserts, so a large batch
  // risks exceeding D1's per-request statement/size limits and wedging the run. Default to
  // a conservative value; override with --batch=N if you've verified a larger size is safe.
  const batchSize = numericFlag(args, 'batch', 25);
  const dryRun = args.has('dry-run');
  let id = numericFlag(args, 'from', existsSync(CHECKPOINT) ? JSON.parse(readFileSync(CHECKPOINT, 'utf8')).lastId + 1 : 1);
  const to = args.has('to') ? numericFlag(args, 'to', Infinity) : Infinity;

  let misses = 0, ok = 0;
  let batch: string[] = [];
  let batchMaxId: number | null = null;

  const writeCheckpoint = (lastId: number) => {
    if (dryRun) return;
    writeFileSync(CHECKPOINT, JSON.stringify({ lastId, ok }));
  };

  // Flushes any queued batch to D1. Only once wrangler succeeds do we advance the
  // durable checkpoint to the max id in that batch — a mid-batch crash (or a
  // d1Exec throw) leaves the checkpoint at the previous flush, so resume re-fetches
  // the unflushed ids instead of silently losing them.
  const flush = () => {
    if (!batch.length) { batch = []; batchMaxId = null; return; }
    if (!dryRun) d1Exec(batch.join('\n'));
    const flushedMaxId = batchMaxId;
    batch = [];
    batchMaxId = null;
    if (flushedMaxId !== null) writeCheckpoint(flushedMaxId);
  };

  for (; id <= to; id++) {
    let entry: Awaited<ReturnType<typeof fetchEntry>> = null;
    let attempt = 0;
    for (;;) {
      try {
        entry = await fetchEntry(id);
        break;
      } catch (e) {
        attempt++;
        if (attempt > MAX_RETRIES) {
          console.error(`Giving up on id ${id} after ${MAX_RETRIES} retries: ${(e as Error).message}`);
          entry = null;
          break;
        }
        console.log(`Retry ${attempt}/${MAX_RETRIES} for id ${id}: ${(e as Error).message}`);
        await sleep(backoffMs(attempt - 1, delay));
      }
    }
    if (!entry) {
      if (++misses >= stopAfter && !args.has('to')) { console.log(`Stopping: ${stopAfter} consecutive misses at id ${id}`); break; }
      await sleep(delay); continue;
    }
    misses = 0;
    const result = buildResult(entry.html, entry.slug, id);
    batch.push(entryToSql(result, collectAliases(result), Date.now()));
    batchMaxId = id;
    ok++;
    if (batch.length >= batchSize) flush();
    if (ok % 100 === 0) console.log(`ok=${ok} at id=${id}`);
    await sleep(delay);
  }
  flush();
  console.log(`Done. Stored ${ok} entries. Checkpoint at ${CHECKPOINT}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

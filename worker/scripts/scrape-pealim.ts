import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { buildResult, collectAliases, entryToSql, slugFromLocation, shouldRetryStatus, backoffMs } from './scrape-lib';

const UA = 'Mozilla/5.0 (compatible; DikDuk/1.0; +https://github.com/erimeilis/dikduk)';
const CHECKPOINT = new URL('./.pealim-scrape-checkpoint.json', import.meta.url).pathname;
const MAX_RETRIES = 8; // ~ up to backoffMs cap of 10 min per id before giving up

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
  const file = new URL('./.pealim-scrape-batch.sql', import.meta.url).pathname;
  writeFileSync(file, sql);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'pealim', '--remote', `--file=${file}`], { stdio: 'inherit' });
  rmSync(file);
}

async function main() {
  const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
  const delaySec = Number(args.get('delay') ?? 10);
  const delay = delaySec * 1000;
  const stopAfter = Number(args.get('stop-after') ?? 50);
  const batchSize = Number(args.get('batch') ?? 200);
  const dryRun = args.has('dry-run');
  let id = Number(args.get('from') ?? (existsSync(CHECKPOINT) ? JSON.parse(readFileSync(CHECKPOINT, 'utf8')).lastId + 1 : 1));
  const to = args.has('to') ? Number(args.get('to')) : Infinity;

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

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { buildResult, collectAliases, entryToSql, slugFromLocation } from './scrape-lib';

const UA = 'Mozilla/5.0 (compatible; DikDuk/1.0; +https://github.com/erimeilis/dikduk)';
const CHECKPOINT = new URL('./.pealim-scrape-checkpoint.json', import.meta.url).pathname;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchEntry(id: number): Promise<{ slug: string; html: string } | null> {
  const head = await fetch(`https://www.pealim.com/dict/${id}/`, {
    headers: { 'User-Agent': UA }, redirect: 'manual',
  });
  if (head.status === 404) return null;
  if (head.status !== 302) { if (head.status === 429) throw new Error('rate-limited'); return null; }
  const slug = slugFromLocation(head.headers.get('location') ?? '');
  if (!slug) return null;
  const page = await fetch(`https://www.pealim.com/dict/${id}-${slug}/`, { headers: { 'User-Agent': UA } });
  if (!page.ok) return null;
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
  const flush = () => {
    if (!batch.length || dryRun) { batch = []; return; }
    d1Exec(batch.join('\n'));
    batch = [];
  };

  for (; id <= to; id++) {
    let entry: Awaited<ReturnType<typeof fetchEntry>> = null;
    try { entry = await fetchEntry(id); }
    catch { await sleep(delay * 10); id--; continue; } // backoff + retry same id
    if (!entry) {
      if (++misses >= stopAfter && !args.has('to')) { console.log(`Stopping: ${stopAfter} consecutive misses at id ${id}`); break; }
      await sleep(delay); continue;
    }
    misses = 0;
    const result = buildResult(entry.html, entry.slug, id);
    batch.push(entryToSql(result, collectAliases(result), Date.now()));
    ok++;
    if (batch.length >= batchSize) flush();
    writeFileSync(CHECKPOINT, JSON.stringify({ lastId: id, ok }));
    if (ok % 100 === 0) console.log(`ok=${ok} at id=${id}`);
    await sleep(delay);
  }
  flush();
  console.log(`Done. Stored ${ok} entries. Checkpoint at ${CHECKPOINT}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

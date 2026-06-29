// Production Worker. For local dev, temporarily set this to 'http://localhost:8787'
// and run `npm run dev` in worker/ (localhost is also allowed in manifest host_permissions).
export const WORKER_URL = 'https://pealim-lookup.admice.workers.dev';
export const ANALYZE_WORKER_URLS = ['http://localhost:8787', WORKER_URL] as const;

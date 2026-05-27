const MCP_API_URL = import.meta.env.VITE_MCP_API_URL || 'http://localhost:8000';
const COGNITIVE_API_URL = import.meta.env.VITE_COGNITIVE_API_URL || 'http://localhost:8002';
const EVOLVE_API_URL = import.meta.env.VITE_EVOLVE_API_URL || 'http://localhost:8003';

let _cachedResult: boolean | null = null;
let _checkPromise: Promise<boolean> | null = null;

export async function checkBackendOnline(timeout = 2000): Promise<boolean> {
  if (_cachedResult !== null) return _cachedResult;
  if (_checkPromise) return _checkPromise;

  _checkPromise = _performCheck(timeout);
  return _checkPromise;
}

async function _performCheck(timeout: number): Promise<boolean> {
  const endpoints = [
    `${MCP_API_URL}/api/health`,
    `${COGNITIVE_API_URL}/api/health`,
  ];

  const results = await Promise.allSettled(
    endpoints.map(url =>
      fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(timeout),
        cache: 'no-store',
      })
        .then(r => r.ok)
        .catch(() => false)
    )
  );

  const anyOnline = results.some(
    r => r.status === 'fulfilled' && r.value === true
  );

  _cachedResult = anyOnline;
  setTimeout(() => { _cachedResult = null; _checkPromise = null; }, 30000);
  return anyOnline;
}

export function resetBackendCheck() {
  _cachedResult = null;
  _checkPromise = null;
}

export function getApiUrls() {
  return {
    mcp: MCP_API_URL,
    cognitive: COGNITIVE_API_URL,
    evolve: EVOLVE_API_URL,
  };
}

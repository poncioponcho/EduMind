import { checkBackendOnline } from '@/utils/backendCheck';

function getDemoParam(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('demo') === '1';
}

export let IS_MOCK_MODE = getDemoParam();

export async function initMockMode(): Promise<boolean> {
  if (getDemoParam()) {
    IS_MOCK_MODE = true;
    return true;
  }
  const online = await checkBackendOnline();
  if (!online) {
    IS_MOCK_MODE = true;
  }
  return IS_MOCK_MODE;
}

export function setMockMode(value: boolean) {
  IS_MOCK_MODE = value;
}

export function getApiBase(service: 'mcp' | 'cognitive' | 'evolve' = 'mcp'): string {
  if (IS_MOCK_MODE) return '/mock';
  const urls = {
    mcp: import.meta.env.VITE_MCP_API_URL || 'http://localhost:8000',
    cognitive: import.meta.env.VITE_COGNITIVE_API_URL || 'http://localhost:8002',
    evolve: import.meta.env.VITE_EVOLVE_API_URL || 'http://localhost:8003',
  };
  return urls[service];
}

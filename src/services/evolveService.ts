const EVOLVE_API = 'http://localhost:8003';

export interface EvolveStats {
  step_count: number;
  train_count: number;
  episode_count: number;
  best_reward: number;
  avg_reward_100: number;
  rules_count: number;
  reflection_stats: {
    reflection_count: number;
    rules_extracted: number;
    total_rules: number;
  };
  router_stats: {
    rule: number;
    rl: number;
    llm: number;
    total_decisions: number;
    rule_pct: number;
    rl_pct: number;
    llm_pct: number;
  };
  buffer_size: number;
}

export interface Strategy {
  id: number;
  name: string;
  name_cn: string;
}

export interface Rule {
  condition: string;
  strategy: number;
  strategy_name: string;
  strategy_name_cn: string;
  confidence: number;
  source: string;
  usage_count: number;
  success_count: number;
  success_rate: number;
}

export interface StrategyDecision {
  strategy: number;
  strategy_name: string;
  strategy_name_cn: string;
  source: string;
  confidence: number;
}

export interface SimulateResult {
  total_episodes: number;
  episodes: Array<{
    episode: number;
    strategy: number;
    strategy_name_cn: string;
    reward: number;
    pre_mastery: number;
    post_mastery: number;
    mastered: boolean;
  }>;
  train_result: Record<string, unknown>;
  stats: EvolveStats;
}

export interface ABTestResult {
  strategy_a: { id: number; name_cn: string; avg_reward: number };
  strategy_b: { id: number; name_cn: string; avg_reward: number };
  winner: { id: number; name_cn: string };
  num_students: number;
  concept: string;
}

class EvolveService {
  private ws: WebSocket | null = null;

  async getStats(): Promise<EvolveStats> {
    const r = await fetch(`${EVOLVE_API}/api/stats`);
    if (!r.ok) throw new Error(`Stats fetch failed: ${r.status}`);
    return r.json();
  }

  async getStrategies(): Promise<Strategy[]> {
    const r = await fetch(`${EVOLVE_API}/api/strategies`);
    const d = await r.json();
    return d.strategies;
  }

  async getRules(): Promise<Rule[]> {
    const r = await fetch(`${EVOLVE_API}/api/rules`);
    const d = await r.json();
    return d.rules;
  }

  async getRewardHistory(limit = 100): Promise<number[]> {
    const r = await fetch(`${EVOLVE_API}/api/reward_history?limit=${limit}`);
    const d = await r.json();
    return d.rewards;
  }

  async selectStrategy(params: {
    student_id?: string;
    concept?: string;
    mastery?: number;
    confidence?: number;
    frustration?: number;
    engagement?: number;
    attempts?: number;
    correct_rate?: number;
  }): Promise<StrategyDecision> {
    const r = await fetch(`${EVOLVE_API}/api/select_strategy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!r.ok) throw new Error(`Strategy selection failed: ${r.status}`);
    return r.json();
  }

  async submitFeedback(params: {
    student_id: string;
    concept: string;
    strategy: number;
    interactions: Array<Record<string, unknown>>;
    pre_mastery: number;
    pre_confidence: number;
  }): Promise<Record<string, unknown>> {
    const r = await fetch(`${EVOLVE_API}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!r.ok) throw new Error(`Feedback submission failed: ${r.status}`);
    return r.json();
  }

  async train(batchSize = 64, ppoEpochs = 3): Promise<Record<string, unknown>> {
    const r = await fetch(`${EVOLVE_API}/api/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_size: batchSize, ppo_epochs: ppoEpochs }),
    });
    if (!r.ok) throw new Error(`Training failed: ${r.status}`);
    return r.json();
  }

  async simulate(numEpisodes = 10, concept = '导数'): Promise<SimulateResult> {
    const r = await fetch(`${EVOLVE_API}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ num_episodes: numEpisodes, concept }),
    });
    if (!r.ok) throw new Error(`Simulation failed: ${r.status}`);
    return r.json();
  }

  async abTest(params: {
    strategy_a: number;
    strategy_b: number;
    num_students?: number;
    concept?: string;
  }): Promise<ABTestResult> {
    const r = await fetch(`${EVOLVE_API}/api/ab_test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!r.ok) throw new Error(`A/B test failed: ${r.status}`);
    return r.json();
  }

  async saveCheckpoint(tag = 'manual'): Promise<{ status: string; tag: string }> {
    const r = await fetch(`${EVOLVE_API}/api/save?tag=${tag}`, { method: 'POST' });
    if (!r.ok) throw new Error(`Save failed: ${r.status}`);
    return r.json();
  }

  async getStrategyDetail(id: number): Promise<Record<string, string>> {
    const r = await fetch(`${EVOLVE_API}/api/strategy/${id}`);
    if (!r.ok) throw new Error(`Strategy detail failed: ${r.status}`);
    return r.json();
  }

  connectWS(onEvent: (type: string, data: unknown) => void) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${proto}//localhost:8003/ws/events`);

    this.ws.onopen = () => onEvent('ws_connected', null);
    this.ws.onclose = () => {
      onEvent('ws_disconnected', null);
      setTimeout(() => this.connectWS(onEvent), 3000);
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        onEvent(msg.type, msg.data);
      } catch { /* ignore parse errors */ }
    };
    this.ws.onerror = () => onEvent('ws_error', null);
  }

  disconnectWS() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const evolveService = new EvolveService();

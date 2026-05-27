import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { evolveService } from '@/services/evolveService';
import type { EvolveStats, Strategy, Rule } from '@/services/evolveService';

interface Props {
  onNavigate: (page: 'landing' | 'diagnosis' | 'teaching' | 'path' | 'report' | 'admin' | 'evolve') => void;
}

export function EvolvePage({ onNavigate }: Props) {
  const [stats, setStats] = useState<EvolveStats | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [rewardHistory, setRewardHistory] = useState<number[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string>('');
  const [simEpisodes, setSimEpisodes] = useState(10);
  const [simConcept, setSimConcept] = useState('导数');

  const refreshAll = useCallback(async () => {
    try {
      const [s, st, r, rh] = await Promise.all([
        evolveService.getStats(),
        evolveService.getStrategies(),
        evolveService.getRules(),
        evolveService.getRewardHistory(50),
      ]);
      setStats(s);
      setStrategies(st);
      setRules(r);
      setRewardHistory(rh);
    } catch (e) {
      console.error('Refresh failed:', e);
    }
  }, []);

  useEffect(() => {
    refreshAll();
    evolveService.connectWS((type, data) => {
      if (type === 'ws_connected') setWsConnected(true);
      else if (type === 'ws_disconnected' || type === 'ws_error') setWsConnected(false);
      else if (type === 'episode_complete') {
        refreshAll();
        if (data && typeof data === 'object' && 'strategy' in data) {
          setActiveStrategy((data as { strategy: number }).strategy);
        }
      } else if (type === 'train_complete' || type === 'simulation_complete') {
        refreshAll();
      }
    });
    const interval = setInterval(refreshAll, 10000);
    return () => {
      clearInterval(interval);
      evolveService.disconnectWS();
    };
  }, [refreshAll]);

  const handleTrain = async () => {
    setLoading(true);
    try {
      const result = await evolveService.train();
      setActionResult(JSON.stringify(result));
      await refreshAll();
    } catch (e) {
      setActionResult(`Error: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  const handleSimulate = async () => {
    setLoading(true);
    try {
      const result = await evolveService.simulate(simEpisodes, simConcept);
      setActionResult(`Simulated ${result.total_episodes} episodes, train: ${JSON.stringify(result.train_result)}`);
      await refreshAll();
    } catch (e) {
      setActionResult(`Error: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    try {
      const result = await evolveService.saveCheckpoint('manual');
      setActionResult(`Saved: ${result.tag}`);
    } catch (e) {
      setActionResult(`Error: ${(e as Error).message}`);
    }
  };

  const routerStats = stats?.router_stats;
  const rulePct = routerStats?.rule_pct ?? 0;
  const rlPct = routerStats?.rl_pct ?? 0;
  const llmPct = routerStats?.llm_pct ?? 0;

  const maxAbsReward = Math.max(...rewardHistory.map(Math.abs), 1);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-lg">
            🧬
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">自进化教学系统</h1>
            <p className="text-xs text-muted-foreground">Reward → Policy → Reflection → Router</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={wsConnected ? 'default' : 'destructive'} className="text-xs">
            {wsConnected ? 'WS 已连接' : 'WS 未连接'}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {stats ? '系统就绪' : '加载中...'}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('landing')}>
            ← 返回
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">总交互步数</div>
            <div className="text-2xl font-bold text-cyan-400">{stats?.step_count ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">训练步数</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">训练轮次</div>
            <div className="text-2xl font-bold text-green-400">{stats?.train_count ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">PPO更新次数</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">最佳奖励</div>
            <div className="text-2xl font-bold text-yellow-400">
              {stats?.best_reward ? stats.best_reward.toFixed(2) : '-'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">历史最高</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">进化规则数</div>
            <div className="text-2xl font-bold text-pink-400">{stats?.rules_count ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">自反思提取</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm text-muted-foreground">奖励曲线 (最近50)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-40 flex items-end gap-0.5">
              {rewardHistory.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  暂无数据，运行模拟以生成
                </div>
              ) : (
                rewardHistory.map((v, i) => (
                  <div
                    key={i}
                    className={`flex-1 min-w-[3px] rounded-t-sm transition-all duration-300 ${
                      v < 0 ? 'bg-red-400' : 'bg-cyan-400'
                    }`}
                    style={{ height: `${(Math.abs(v) / maxAbsReward) * 100}%` }}
                    title={`Reward: ${v.toFixed(2)}`}
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm text-muted-foreground">三层路由分布</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="text-xs text-muted-foreground">
              规则: {routerStats?.rule ?? 0} ({rulePct.toFixed(0)}%) |{' '}
              RL: {routerStats?.rl ?? 0} ({rlPct.toFixed(0)}%) |{' '}
              LLM: {routerStats?.llm ?? 0} ({llmPct.toFixed(0)}%)
            </div>
            <div className="flex h-6 rounded overflow-hidden">
              {rulePct > 0 && (
                <div className="bg-green-400 flex items-center justify-center text-xs font-bold text-black" style={{ width: `${rulePct}%` }}>
                  {rulePct > 8 ? `${rulePct.toFixed(0)}%` : ''}
                </div>
              )}
              {rlPct > 0 && (
                <div className="bg-cyan-400 flex items-center justify-center text-xs font-bold text-black" style={{ width: `${rlPct}%` }}>
                  {rlPct > 8 ? `${rlPct.toFixed(0)}%` : ''}
                </div>
              )}
              {llmPct > 0 && (
                <div className="bg-purple-400 flex items-center justify-center text-xs font-bold text-black" style={{ width: `${llmPct}%` }}>
                  {llmPct > 8 ? `${llmPct.toFixed(0)}%` : ''}
                </div>
              )}
            </div>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-muted-foreground">规则层 (L1)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-muted-foreground">RL策略层 (L2)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="text-muted-foreground">LLM兜底层 (L3)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm text-muted-foreground">20种教学策略</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
            {strategies.map((s) => (
              <div
                key={s.id}
                className={`p-2 rounded text-center text-xs border transition-all cursor-default ${
                  activeStrategy === s.id
                    ? 'border-cyan-400 bg-cyan-400/10'
                    : 'border-border bg-secondary/50 hover:border-cyan-400/50'
                }`}
              >
                <div className="font-bold text-cyan-400 text-sm">{s.id}</div>
                <div className="text-muted-foreground mt-0.5 truncate" title={s.name_cn}>
                  {s.name_cn}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm text-muted-foreground">进化规则库</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="max-h-48 overflow-y-auto space-y-2">
              {rules.length === 0 ? (
                <div className="text-muted-foreground text-xs">暂无规则，系统将通过自反思自动提取</div>
              ) : (
                rules.map((r, i) => (
                  <div key={i} className="p-2 bg-secondary/50 rounded border-l-2 border-yellow-400 text-xs">
                    <span className="text-yellow-400 font-semibold">IF {r.condition}</span>
                    <span className="text-muted-foreground ml-1">
                      → 策略{r.strategy}({r.strategy_name_cn}) 置信度:{r.confidence.toFixed(2)} 使用:{r.usage_count}次
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm text-muted-foreground">系统控制</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              触发训练、运行模拟、保存检查点
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleTrain} disabled={loading} className="bg-cyan-600 hover:bg-cyan-700">
                触发训练
              </Button>
              <Button size="sm" onClick={handleSimulate} disabled={loading} variant="secondary">
                运行模拟 ({simEpisodes}ep)
              </Button>
              <Button size="sm" onClick={handleSave} variant="secondary">
                保存检查点
              </Button>
              <Button size="sm" onClick={refreshAll} variant="ghost">
                刷新
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">模拟Ep数:</label>
              <input
                type="number"
                value={simEpisodes}
                onChange={(e) => setSimEpisodes(Number(e.target.value))}
                className="w-16 px-2 py-1 text-xs bg-secondary border border-border rounded text-white"
                min={1}
                max={100}
              />
              <label className="text-xs text-muted-foreground ml-2">知识点:</label>
              <input
                type="text"
                value={simConcept}
                onChange={(e) => setSimConcept(e.target.value)}
                className="w-20 px-2 py-1 text-xs bg-secondary border border-border rounded text-white"
              />
            </div>

            {actionResult && (
              <div className="text-xs text-muted-foreground bg-secondary/30 p-2 rounded break-all">
                {actionResult}
              </div>
            )}

            {stats && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Buffer: {stats.buffer_size} / 100000</div>
                <Progress value={(stats.buffer_size / 100000) * 100} className="h-1" />
                <div className="text-xs text-muted-foreground">
                  平均奖励(100ep): {stats.avg_reward_100.toFixed(2)} | Episodes: {stats.episode_count}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm text-muted-foreground">进化时间线</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="p-2 rounded bg-secondary/50 border border-border">
              <div className="text-cyan-400 font-semibold">Day 1</div>
              <div className="text-muted-foreground">LLM兜底为主，RL随机探索</div>
            </div>
            <div className="p-2 rounded bg-secondary/50 border border-border">
              <div className="text-cyan-400 font-semibold">Week 1</div>
              <div className="text-muted-foreground">识别学生类型，策略分化</div>
            </div>
            <div className="p-2 rounded bg-secondary/50 border border-border">
              <div className="text-cyan-400 font-semibold">Week 2</div>
              <div className="text-muted-foreground">1000+episodes，RL超越启发式</div>
            </div>
            <div className="p-2 rounded bg-secondary/50 border border-border">
              <div className="text-cyan-400 font-semibold">Week 4</div>
              <div className="text-muted-foreground">自反思提取50+规则，规则驱动80%</div>
            </div>
            <div className="p-2 rounded bg-secondary/50 border border-border">
              <div className="text-cyan-400 font-semibold">Week 8</div>
              <div className="text-muted-foreground">学科专用策略簇</div>
            </div>
            <div className="p-2 rounded bg-secondary/50 border border-border">
              <div className="text-cyan-400 font-semibold">Week 12</div>
              <div className="text-muted-foreground">个体级适应</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

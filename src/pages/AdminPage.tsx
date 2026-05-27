import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAgentStates, subscribeToAgentStates, subscribeToAgentMessages } from '@/services/agentService';
import { getAgentLogs } from '@/services/database';
import { MCPToolsPanel } from '@/components/MCPToolsPanel';
import type { AgentState, AgentMessage } from '@/types';
import { Activity, Cpu, MessageSquare, Terminal, Zap, Server, Wifi, WifiOff } from 'lucide-react';

interface AdminPageProps {
  onBack: () => void;
}

export function AdminPage({ onBack }: AdminPageProps) {
  const [agents, setAgents] = useState<AgentState[]>(getAgentStates());
  const [logs, setLogs] = useState<AgentMessage[]>([]);
  const [isConnected] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'architecture' | 'mcp'>('overview');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubStates = subscribeToAgentStates(setAgents);
    const unsubMessages = subscribeToAgentMessages((msg) => {
      setLogs(prev => [...prev, msg].slice(-100));
    });

    // 加载历史日志
    setLogs(getAgentLogs().slice(-50));

    return () => {
      unsubStates();
      unsubMessages();
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-amber-400';
      case 'completed': return 'text-emerald-400';
      case 'error': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'running': return 'bg-amber-500/10 border-amber-500/30';
      case 'completed': return 'bg-emerald-500/10 border-emerald-500/30';
      case 'error': return 'bg-red-500/10 border-red-500/30';
      default: return 'bg-white/5 border-white/10';
    }
  };

  const runningCount = agents.filter(a => a.status === 'running').length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1">Agent 管理控制台</h2>
          <p className="text-muted-foreground text-sm">Go Goroutine 驱动的多Agent调度监控</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            {isConnected ? (
              <Wifi className="w-4 h-4 text-emerald-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-400" />
            )}
            <span className="text-xs text-muted-foreground">
              {isConnected ? '调度器在线' : '离线'}
            </span>
          </div>
          <Button
            onClick={onBack}
            variant="outline"
            size="sm"
            className="border-white/20 text-white hover:bg-white/10"
          >
            返回首页
          </Button>
        </div>
      </div>

      {/* Tab */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'overview' as const, label: '总览', icon: Activity },
          { id: 'logs' as const, label: '通信日志', icon: MessageSquare },
          { id: 'architecture' as const, label: '架构图', icon: Server },
          { id: 'mcp' as const, label: 'MCP工具', icon: Zap },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              activeTab === tab.id
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'text-muted-foreground hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* 总览页 */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 统计卡 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card/50 border-border/50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <Cpu className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{agents.length}</div>
                  <div className="text-xs text-muted-foreground">Agent总数</div>
                </div>
              </div>
            </Card>
            <Card className="bg-card/50 border-border/50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{runningCount}</div>
                  <div className="text-xs text-muted-foreground">运行中</div>
                </div>
              </div>
            </Card>
            <Card className="bg-card/50 border-border/50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">
                    {agents.reduce((sum, a) => sum + a.taskCount, 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">总任务数</div>
                </div>
              </div>
            </Card>
            <Card className="bg-card/50 border-border/50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{logs.length}</div>
                  <div className="text-xs text-muted-foreground">通信消息</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Agent 状态卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map(agent => (
              <Card key={agent.type} className={`border ${getStatusBg(agent.status)} p-5 transition-all`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: agent.color + '20' }}>
                      <img src={agent.icon} alt="" className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground">{agent.description}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 ${getStatusColor(agent.status)}`}>
                    <span className={`w-2 h-2 rounded-full ${
                      agent.status === 'running' ? 'bg-amber-400 animate-pulse' :
                      agent.status === 'completed' ? 'bg-emerald-400' :
                      'bg-slate-400'
                    }`} />
                    <span className="text-xs capitalize">{agent.status}</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-lg font-semibold text-white">{agent.taskCount}</div>
                    <div className="text-[10px] text-muted-foreground">处理任务</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {agent.lastActive ? Math.round((Date.now() - agent.lastActive) / 1000) + 's' : '-'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">最后活跃</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">goroutine</div>
                    <div className="text-[10px] text-muted-foreground">并发模型</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 日志页 */}
      {activeTab === 'logs' && (
        <Card className="bg-black/50 border-border/50">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              Agent 通信日志
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLogs([])}
              className="border-white/20 text-white hover:bg-white/10 text-xs h-7"
            >
              清空
            </Button>
          </div>
          <div className="p-4 h-96 overflow-y-auto font-mono text-xs space-y-2">
            {logs.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>暂无通信记录</p>
                <p className="text-[10px] mt-1">与系统交互后将在此显示Agent间通信</p>
              </div>
            )}
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-muted-foreground shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
                  style={{
                    backgroundColor: {
                      diagnostician: 'rgba(79,70,229,0.2)',
                      tutor: 'rgba(16,185,129,0.2)',
                      planner: 'rgba(245,158,11,0.2)',
                      evaluator: 'rgba(236,72,153,0.2)',
                    }[log.agent],
                    color: {
                      diagnostician: '#818cf8',
                      tutor: '#34d399',
                      planner: '#fbbf24',
                      evaluator: '#f472b6',
                    }[log.agent],
                  }}
                >
                  {log.agent.toUpperCase().slice(0, 4)}
                </span>
                <span className="text-white/80">{log.content}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </Card>
      )}

      {/* 架构页 */}
      {activeTab === 'architecture' && (
        <div className="space-y-6">
          {/* Go调度器架构图 */}
          <Card className="bg-card/50 border-border/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Go Goroutine 调度架构</h3>
            <div className="flex flex-col items-center gap-4">
              {/* API网关 */}
              <div className="w-full max-w-md p-4 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-center">
                <div className="text-sm font-semibold text-indigo-400">Gin API 网关</div>
                <div className="text-xs text-muted-foreground">HTTP/WebSocket 请求入口</div>
              </div>

              <div className="w-px h-6 bg-indigo-500/30" />

              {/* Agent调度器 */}
              <div className="w-full max-w-lg p-4 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-center">
                <div className="text-sm font-semibold text-amber-400">Agent Orchestrator 调度器</div>
                <div className="text-xs text-muted-foreground">goroutine + channel 并发调度核心</div>
              </div>

              <div className="w-px h-6 bg-amber-500/30" />

              {/* Agent工作池 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl">
                {agents.map(agent => (
                  <div
                    key={agent.type}
                    className={`p-3 rounded-xl border text-center ${getStatusBg(agent.status)}`}
                  >
                    <img src={agent.icon} alt="" className="w-6 h-6 mx-auto mb-1" />
                    <div className="text-xs font-medium text-white">{agent.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {agent.status === 'running' ? '● 运行中' : '○ 空闲'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="w-px h-6 bg-white/10" />

              {/* 数据层 */}
              <div className="w-full max-w-md p-4 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-center">
                <div className="text-sm font-semibold text-emerald-400">数据层</div>
                <div className="text-xs text-muted-foreground">SQLite + JSON知识图谱 + OpenRouter API</div>
              </div>
            </div>
          </Card>

          {/* Go vs C++ 对比 */}
          <Card className="bg-card/50 border-border/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">为什么用 Go 替代 C++？</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                <h4 className="text-sm font-semibold text-red-400 mb-2">C++ 并行栈</h4>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>• 需要手动管理线程</li>
                  <li>• 锁机制复杂易出错</li>
                  <li>• 代码量大，维护困难</li>
                  <li>• 编译依赖重</li>
                </ul>
              </div>
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-bold text-indigo-400 mb-1">VS</div>
                  <div className="text-xs text-muted-foreground">架构升级</div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <h4 className="text-sm font-semibold text-emerald-400 mb-2">Go Goroutine</h4>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>• goroutine 轻量高效</li>
                  <li>• channel 安全通信</li>
                  <li>• 代码量减少 80%</li>
                  <li>• 内置调度器，零依赖</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'mcp' && (
        <div className="space-y-6">
          <MCPToolsPanel />
        </div>
      )}
    </div>
  );
}

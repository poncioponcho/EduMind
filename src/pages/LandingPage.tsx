import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getAgentStates, subscribeToAgentStates } from '@/services/agentService';
import type { AgentState, User } from '@/types';

interface LandingPageProps {
  onStart: () => void;
  onViewPath: () => void;
  onViewReport: () => void;
  onAdmin: () => void;
  user: User | null;
}

export function LandingPage({ onStart, onViewPath, onViewReport, onAdmin, user }: LandingPageProps) {
  const [agents, setAgents] = useState<AgentState[]>(getAgentStates());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const unsub = subscribeToAgentStates(setAgents);
    return unsub;
  }, []);

  // 粒子动画背景
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // 知识点节点
    const nodes: { x: number; y: number; vx: number; vy: number; r: number; color: string; label: string }[] = [
      { x: 200, y: 200, vx: 0.3, vy: 0.2, r: 30, color: '#4f46e5', label: '极限' },
      { x: 400, y: 150, vx: -0.2, vy: 0.3, r: 25, color: '#10b981', label: '导数' },
      { x: 350, y: 350, vx: 0.2, vy: -0.2, r: 28, color: '#f59e0b', label: '积分' },
      { x: 600, y: 250, vx: -0.3, vy: -0.1, r: 22, color: '#ec4899', label: '级数' },
      { x: 550, y: 400, vx: 0.1, vy: 0.3, r: 26, color: '#6366f1', label: '微分方程' },
      { x: 750, y: 180, vx: -0.2, vy: 0.2, r: 24, color: '#14b8a6', label: '偏导数' },
      { x: 150, y: 450, vx: 0.3, vy: -0.1, r: 20, color: '#8b5cf6', label: '泰勒公式' },
      { x: 800, y: 380, vx: -0.1, vy: -0.3, r: 23, color: '#f43f5e', label: '重积分' },
    ];

    let animId: number;
    const animate = () => {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 更新和绘制节点
      nodes.forEach(node => {
        node.x += node.vx;
        node.y += node.vy;

        if (node.x < node.r || node.x > canvas.width - node.r) node.vx *= -1;
        if (node.y < node.r || node.y > canvas.height - node.r) node.vy *= -1;

        // 绘制节点
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fillStyle = node.color + '30';
        ctx.fill();
        ctx.strokeStyle = node.color + '80';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 绘制文字
        ctx.fillStyle = '#f1f5f9';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + 4);
      });

      // 绘制连线
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 250) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(100, 120, 200, ${0.15 * (1 - dist / 250)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const agentCards = [
    { type: 'diagnostician' as const, icon: '/agent-diagnosis.png', title: '诊断Agent', desc: '5题快速诊断，精准定位薄弱点', color: 'from-indigo-500 to-blue-600' },
    { type: 'tutor' as const, icon: '/agent-tutor.png', title: '教学Agent', desc: 'Socratic对话法，引导式教学', color: 'from-emerald-500 to-teal-600' },
    { type: 'planner' as const, icon: '/agent-planner.png', title: '规划Agent', desc: '知识图谱驱动，个性化路径', color: 'from-amber-500 to-orange-600' },
    { type: 'evaluator' as const, icon: '/agent-evaluator.png', title: '评估Agent', desc: '全方位追踪，可视化进步', color: 'from-pink-500 to-rose-600' },
  ];

  return (
    <div className="relative">
      {/* 粒子背景 */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full"
        style={{ background: '#0a0a0f' }}
      />

      {/* 内容层 */}
      <div className="relative z-10">
        {/* Hero Section */}
        <section className="min-h-[90vh] flex flex-col items-center justify-center px-4">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-indigo-400 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Go Goroutine 驱动的多Agent协作
            </div>

            {/* Title */}
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
              EduMind
              <span className="block text-2xl md:text-3xl font-normal text-indigo-400 mt-2">
                多Agent智能教育中枢
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              四大AI Agent协作，从认知诊断到个性化教学，打造真正模拟真人师生互动的智能学习体验。
              <span className="text-indigo-400">不是检索，而是教学。</span>
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {user ? (
                <Button
                  onClick={onStart}
                  size="lg"
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-8 py-6 text-lg rounded-xl shadow-lg shadow-indigo-500/25 transition-all hover:scale-105"
                >
                  开始学习
                </Button>
              ) : (
                <Button
                  onClick={onStart}
                  size="lg"
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-8 py-6 text-lg rounded-xl shadow-lg shadow-indigo-500/25 transition-all hover:scale-105"
                >
                  免费开始
                </Button>
              )}
              <Button
                onClick={onAdmin}
                variant="outline"
                size="lg"
                className="border-white/20 text-white hover:bg-white/10 px-8 py-6 text-lg rounded-xl"
              >
                查看Agent状态
              </Button>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
            <div className="w-6 h-10 rounded-full border-2 border-white/30 flex items-start justify-center p-1.5">
              <div className="w-1.5 h-2.5 rounded-full bg-white/60" />
            </div>
          </div>
        </section>

        {/* Agent Cards Section */}
        <section className="py-24 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                四大智能Agent协作
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                每个Agent专注不同职责，通过Go的goroutine实现高效并发调度，模拟真实教学团队的协作流程
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {agentCards.map((card) => (
                <Card
                  key={card.type}
                  className="group bg-card/50 border-border/50 backdrop-blur-sm p-6 hover:bg-card/80 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer overflow-hidden"
                  onClick={() => {
                    if (card.type === 'diagnostician') onStart();
                    else if (card.type === 'planner') onViewPath();
                    else if (card.type === 'evaluator') onViewReport();
                    else onStart();
                  }}
                >
                  {/* 顶部渐变条 */}
                  <div className={`h-1 w-full rounded-full bg-gradient-to-r ${card.color} mb-6`} />

                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center p-2.5">
                      <img src={card.icon} alt={card.title} className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          agents.find(a => a.type === card.type)?.status === 'running' ? 'bg-amber-400 animate-pulse' :
                          agents.find(a => a.type === card.type)?.status === 'completed' ? 'bg-emerald-400' : 'bg-emerald-400/50'
                        }`} />
                        <span className="text-xs text-muted-foreground">
                          {agents.find(a => a.type === card.type)?.status === 'running' ? '运行中' :
                           agents.find(a => a.type === card.type)?.status === 'completed' ? '待命中' : '空闲'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {card.desc}
                  </p>

                  {/* 悬停时的光效 */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Flow Section */}
        <section className="py-24 px-4 bg-gradient-to-b from-transparent via-indigo-950/20 to-transparent">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                智能学习流程
              </h2>
              <p className="text-muted-foreground">
                从诊断到评估，完整的教育闭环
              </p>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0">
              {[
                { step: '01', title: '认知诊断', desc: '5题快速测试', color: 'bg-indigo-500' },
                { step: '02', title: '薄弱分析', desc: '精准定位问题', color: 'bg-blue-500' },
                { step: '03', title: '个性化教学', desc: 'Socratic对话', color: 'bg-emerald-500' },
                { step: '04', title: '路径规划', desc: '知识图谱驱动', color: 'bg-amber-500' },
                { step: '05', title: '进度评估', desc: '可视化报告', color: 'bg-pink-500' },
              ].map((item, i) => (
                <div key={item.step} className="flex items-center">
                  <div className="relative group">
                    <div className="w-36 text-center">
                      <div className={`w-12 h-12 ${item.color} rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg`}>
                        <span className="text-white font-bold">{item.step}</span>
                      </div>
                      <h3 className="text-white font-semibold mb-1">{item.title}</h3>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  {i < 4 && (
                    <div className="hidden md:block w-12 h-px bg-gradient-to-r from-white/30 to-white/10 mx-2" />
                  )}
                  {i < 4 && (
                    <div className="md:hidden w-px h-8 bg-gradient-to-b from-white/30 to-white/10 my-2 mx-auto" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tech Stack Section */}
        <section className="py-24 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              技术架构
            </h2>
            <p className="text-muted-foreground mb-12">
              用Go的goroutine替代C++并行栈，代码更简洁，并发更安全
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { name: 'React 19', role: '前端界面', color: 'text-cyan-400' },
                { name: 'Go', role: 'Agent调度网关', color: 'text-cyan-400' },
                { name: 'Goroutine', role: '并发调度', color: 'text-emerald-400' },
                { name: 'Channel', role: 'Agent通信', color: 'text-emerald-400' },
                { name: 'SQLite', role: '数据存储', color: 'text-amber-400' },
                { name: '知识图谱', role: '知识结构', color: 'text-amber-400' },
                { name: 'WebSocket', role: '实时通信', color: 'text-pink-400' },
                { name: 'Socratic', role: '教学方法', color: 'text-pink-400' },
              ].map(tech => (
                <div
                  key={tech.name}
                  className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <div className={`font-mono font-semibold ${tech.color} mb-1`}>{tech.name}</div>
                  <div className="text-xs text-muted-foreground">{tech.role}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 px-4 border-t border-white/5">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">E</span>
              </div>
              <span className="text-sm text-muted-foreground">EduMind - 华东师范大学</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Go Goroutine 驱动的多Agent智能教育系统
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

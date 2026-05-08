import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { generateLearningPath, getAgentStates, subscribeToAgentStates, getAgentColor, getAgentName } from '@/services/agentService';
import { getKnowledgePoints, getLearningRecords } from '@/services/database';
import type { AgentState, DiagnosisResult, LearningPath, PathNode, User } from '@/types';
import { GitBranch, Clock, Lock, CheckCircle2, Circle, Play, Loader2 } from 'lucide-react';

interface PathPageProps {
  user: User;
  onNavigate: (page: 'landing' | 'diagnosis' | 'teaching' | 'path' | 'report' | 'admin') => void;
}

export function PathPage({ user, onNavigate }: PathPageProps) {
  const [path, setPath] = useState<LearningPath | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [agents, setAgents] = useState<AgentState[]>(getAgentStates());

  const knowledgePoints = getKnowledgePoints();
  const records = getLearningRecords(user.id);

  useEffect(() => {
    const unsub = subscribeToAgentStates(setAgents);
    // 如果有诊断结果，尝试生成路径
    const diagnosisStr = localStorage.getItem('edumind_last_diagnosis');
    if (diagnosisStr) {
      try {
        const diagnosis: DiagnosisResult = JSON.parse(diagnosisStr);
        handleGeneratePath(diagnosis);
      } catch {
        generateDefaultPath();
      }
    } else {
      generateDefaultPath();
    }
    return unsub;
  }, []);

  const generateDefaultPath = async () => {
    const mockDiagnosis: DiagnosisResult = {
      weakPoints: ['limit', 'derivative'],
      strongPoints: [],
      recommendedPath: ['limit', 'continuity', 'derivative'],
      overallLevel: 'beginner',
      detailScores: {},
    };
    handleGeneratePath(mockDiagnosis);
  };

  const handleGeneratePath = async (diagnosis: DiagnosisResult) => {
    if (isGenerating) return;
    setIsGenerating(true);
    const newPath = await generateLearningPath(diagnosis, user.id);
    setPath(newPath);
    setIsGenerating(false);
  };

  const getNodeStatus = (node: PathNode) => {
    const record = records.find(r => r.knowledgePointId === node.knowledgePointId);
    if (record?.status === 'mastered') return 'completed';
    if (record?.status === 'learning') return 'in_progress';
    if (node.status === 'available') return 'available';
    return 'locked';
  };

  const getNodeIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'in_progress':
        return <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />;
      case 'available':
        return <Circle className="w-5 h-5 text-indigo-400" />;
      default:
        return <Lock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getNodeColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-emerald-500/40 bg-emerald-500/10';
      case 'in_progress':
        return 'border-indigo-500/40 bg-indigo-500/10';
      case 'available':
        return 'border-indigo-500/20 bg-white/5';
      default:
        return 'border-white/10 bg-white/3';
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">学习路径</h2>
        <p className="text-muted-foreground mb-4">基于知识图谱的个性化学习规划</p>

        {/* Agent状态 */}
        <div className="flex items-center justify-center gap-2 text-sm">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: getAgentColor('planner') + '20' }}
          >
            <img src="/agent-planner.png" alt="" className="w-4 h-4" />
          </div>
          <span className="text-muted-foreground">{getAgentName('planner')}</span>
          {agents.find(a => a.type === 'planner')?.status === 'running' && (
            <span className="text-xs text-amber-400 animate-pulse">规划中...</span>
          )}
        </div>
      </div>

      {/* 统计卡 */}
      {path && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="bg-card/50 border-border/50 p-4 text-center">
            <div className="text-2xl font-bold text-white">{path.nodes.length}</div>
            <div className="text-xs text-muted-foreground">知识点</div>
          </Card>
          <Card className="bg-card/50 border-border/50 p-4 text-center">
            <div className="text-2xl font-bold text-white flex items-center justify-center gap-1">
              <Clock className="w-5 h-5 text-indigo-400" />
              {Math.ceil(path.estimatedTime / 60)}h
            </div>
            <div className="text-xs text-muted-foreground">预计时间</div>
          </Card>
          <Card className="bg-card/50 border-border/50 p-4 text-center">
            <div className="text-2xl font-bold text-white">
              {path.nodes.filter(n => getNodeStatus(n) === 'completed').length}
            </div>
            <div className="text-xs text-muted-foreground">已完成</div>
          </Card>
        </div>
      )}

      {/* 路径可视化 */}
      <div className="space-y-4">
        {path?.nodes.map((node, index) => {
          const kp = knowledgePoints.find(k => k.id === node.knowledgePointId);
          if (!kp) return null;

          const status = getNodeStatus(node);

          return (
            <div key={node.knowledgePointId} className="relative">
              {/* 连接线 */}
              {index < path.nodes.length - 1 && (
                <div className="absolute left-6 top-12 w-px h-6 bg-border" />
              )}

              <Card
                className={`flex items-center gap-4 p-4 border transition-all ${getNodeColor(status)} ${
                  status !== 'locked' ? 'cursor-pointer hover:shadow-md' : 'opacity-60'
                }`}
                onClick={() => {
                  if (status !== 'locked') {
                    onNavigate('teaching');
                  }
                }}
              >
                {/* 状态图标 */}
                <div className="shrink-0">
                  {getNodeIcon(status)}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{kp.name}</span>
                    <span className="text-xs text-muted-foreground">{kp.category}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {node.estimatedTime}min
                    </span>
                    <span>{'★'.repeat(kp.difficulty)}{'☆'.repeat(5 - kp.difficulty)}</span>
                  </div>
                </div>

                {/* 操作 */}
                {status === 'available' && (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate('teaching');
                    }}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 mr-1" />
                    学习
                  </Button>
                )}
                {status === 'completed' && (
                  <span className="text-xs text-emerald-400 shrink-0">已完成</span>
                )}
                {status === 'locked' && (
                  <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </Card>
            </div>
          );
        })}
      </div>

      {/* 知识图谱可视化 */}
      <div className="mt-12">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-indigo-400" />
          知识图谱
        </h3>
        <div className="relative h-80 bg-card/30 rounded-xl border border-border/50 overflow-hidden">
          <svg viewBox="0 0 1000 400" className="w-full h-full">
            {/* 连线 */}
            {knowledgePoints.map(kp =>
              kp.prerequisites.map(prereqId => {
                const prereq = knowledgePoints.find(k => k.id === prereqId);
                if (!prereq) return null;
                return (
                  <line
                    key={`${prereqId}-${kp.id}`}
                    x1={prereq.position.x}
                    y1={prereq.position.y}
                    x2={kp.position.x}
                    y2={kp.position.y}
                    stroke="rgba(100,120,200,0.2)"
                    strokeWidth="1"
                  />
                );
              })
            )}
            {/* 节点 */}
            {knowledgePoints.map(kp => {
              const record = records.find(r => r.knowledgePointId === kp.id);
              const isCompleted = record?.status === 'mastered';
              const isLearning = record?.status === 'learning';

              return (
                <g key={kp.id}>
                  <circle
                    cx={kp.position.x}
                    cy={kp.position.y}
                    r={20 + kp.difficulty * 3}
                    fill={isCompleted ? 'rgba(16,185,129,0.2)' : isLearning ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'}
                    stroke={isCompleted ? '#10b981' : isLearning ? '#6366f1' : 'rgba(255,255,255,0.2)'}
                    strokeWidth="1.5"
                  />
                  <text
                    x={kp.position.x}
                    y={kp.position.y + 4}
                    textAnchor="middle"
                    fill="#f1f5f9"
                    fontSize="11"
                    fontWeight="500"
                  >
                    {kp.name}
                  </text>
                  {isCompleted && (
                    <text
                      x={kp.position.x}
                      y={kp.position.y - 8}
                      textAnchor="middle"
                      fill="#10b981"
                      fontSize="10"
                    >
                      ✓
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

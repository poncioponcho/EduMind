import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { generateEvaluationReport, getAgentStates, subscribeToAgentStates, getAgentColor, getAgentName } from '@/services/agentService';
import { getKnowledgePoints } from '@/services/database';
import type { AgentState, EvaluationReport, User } from '@/types';
import { TrendingUp, Target, Clock, BookOpen, Award, RotateCw } from 'lucide-react';

interface ReportPageProps {
  user: User;
  onNavigate: (page: 'landing' | 'diagnosis' | 'teaching' | 'path' | 'report' | 'admin') => void;
}

export function ReportPage({ user, onNavigate }: ReportPageProps) {
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [agents, setAgents] = useState<AgentState[]>(getAgentStates());

  const knowledgePoints = getKnowledgePoints();

  useEffect(() => {
    const unsub = subscribeToAgentStates(setAgents);
    handleGenerate();
    return unsub;
  }, []);

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    const newReport = await generateEvaluationReport(user.id);
    setReport(newReport);
    setIsGenerating(false);
  };

  if (!report) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">评估Agent正在生成报告...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">学习评估报告</h2>
        <p className="text-muted-foreground">
          生成时间：{new Date(report.generatedAt).toLocaleString()}
        </p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: getAgentColor('evaluator') + '20' }}
          >
            <img src="/agent-evaluator.png" alt="" className="w-4 h-4" />
          </div>
          <span className="text-sm text-muted-foreground">{getAgentName('evaluator')}</span>
          {agents.find(a => a.type === 'evaluator')?.status === 'running' && (
            <span className="text-xs text-amber-400 animate-pulse">分析中...</span>
          )}
        </div>
      </div>

      {/* 总分卡 */}
      <Card className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20 p-8 mb-8">
        <div className="flex flex-col md:flex-row items-center gap-8">
          {/* 环形进度 */}
          <div className="relative w-32 h-32 shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="url(#scoreGradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 50 * report.overallScore / 100} ${2 * Math.PI * 50}`}
              />
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-white">{report.overallScore}</span>
              <span className="text-xs text-muted-foreground">综合分</span>
            </div>
          </div>

          {/* 统计 */}
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-xl bg-white/5">
              <BookOpen className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
              <div className="text-xl font-bold text-white">{report.questionsAnswered}</div>
              <div className="text-xs text-muted-foreground">答题数</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/5">
              <Target className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <div className="text-xl font-bold text-white">{(report.accuracy * 100).toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground">正确率</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/5">
              <Clock className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <div className="text-xl font-bold text-white">{Math.ceil(report.timeSpent / 60)}h</div>
              <div className="text-xs text-muted-foreground">学习时长</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-white/5">
              <Award className="w-5 h-5 text-pink-400 mx-auto mb-1" />
              <div className="text-xl font-bold text-white">
                {Object.keys(report.knowledgeMastery).length > 0
                  ? (Object.values(report.knowledgeMastery).reduce((a, b) => a + b, 0) / Object.values(report.knowledgeMastery).length).toFixed(0)
                  : 0}%
              </div>
              <div className="text-xs text-muted-foreground">掌握度</div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 分类得分 */}
        <Card className="bg-card/50 border-border/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-400" />
            分类掌握度
          </h3>
          <div className="space-y-4">
            {Object.entries(report.categoryScores).map(([category, score]) => (
              <div key={category}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white">{category}</span>
                  <span className={score >= 60 ? 'text-emerald-400' : 'text-amber-400'}>{score.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-indigo-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            ))}
            {Object.keys(report.categoryScores).length === 0 && (
              <p className="text-muted-foreground text-sm">暂无分类数据，继续学习以生成分析</p>
            )}
          </div>
        </Card>

        {/* 知识点掌握度 */}
        <Card className="bg-card/50 border-border/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            知识点详情
          </h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {Object.entries(report.knowledgeMastery).map(([kpId, mastery]) => {
              const kp = knowledgePoints.find(k => k.id === kpId);
              if (!kp) return null;
              return (
                <div key={kpId} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                  <span className="text-sm text-white">{kp.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full ${mastery >= 80 ? 'bg-emerald-500' : mastery >= 60 ? 'bg-indigo-500' : 'bg-amber-500'}`}
                        style={{ width: `${mastery}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{mastery.toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
            {Object.keys(report.knowledgeMastery).length === 0 && (
              <p className="text-muted-foreground text-sm">暂无知识点数据</p>
            )}
          </div>
        </Card>
      </div>

      {/* 学习趋势 */}
      <Card className="bg-card/50 border-border/50 p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-400" />
          学习趋势
        </h3>
        <div className="h-48">
          <svg viewBox="0 0 600 180" className="w-full h-full">
            {/* 网格线 */}
            {[0, 1, 2, 3, 4].map(i => (
              <line
                key={i}
                x1="40"
                y1={30 + i * 30}
                x2="580"
                y2={30 + i * 30}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
            ))}
            {/* 折线 */}
            <polyline
              fill="none"
              stroke="url(#trendGradient)"
              strokeWidth="2"
              points={report.trends.map((t, i) => `${60 + i * 80},${150 - t.score}`).join(' ')}
            />
            {/* 数据点 */}
            {report.trends.map((t, i) => (
              <g key={i}>
                <circle
                  cx={60 + i * 80}
                  cy={150 - t.score}
                  r="4"
                  fill="#6366f1"
                  stroke="white"
                  strokeWidth="1"
                />
                <text
                  x={60 + i * 80}
                  y={170}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.5)"
                  fontSize="10"
                >
                  {t.date.slice(5)}
                </text>
              </g>
            ))}
            <defs>
              <linearGradient id="trendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </Card>

      {/* 建议 */}
      <Card className="bg-card/50 border-border/50 p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-400" />
          个性化建议
        </h3>
        <div className="space-y-3">
          {report.suggestions.map((suggestion, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
              <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-white/80">{suggestion}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* 操作按钮 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="bg-indigo-500 hover:bg-indigo-600 text-white"
        >
          <RotateCw className={`w-4 h-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
          重新生成
        </Button>
        <Button
          onClick={() => onNavigate('diagnosis')}
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
        >
          再次诊断
        </Button>
      </div>
    </div>
  );
}

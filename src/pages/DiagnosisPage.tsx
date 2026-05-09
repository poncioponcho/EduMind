import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { runDiagnosis, getAgentStates, subscribeToAgentStates, getAgentColor, getAgentName } from '@/services/agentService';
import { getQuestions, getKnowledgePointById } from '@/services/database';
import type { AgentState, DiagnosisResult, Question, User } from '@/types';
import { CheckCircle2, XCircle, ChevronRight, ChevronLeft, Brain } from 'lucide-react';

interface DiagnosisPageProps {
  user: User;
  onComplete: (result: DiagnosisResult) => void;
  onNavigate: (page: 'landing' | 'diagnosis' | 'teaching' | 'path' | 'report' | 'admin') => void;
}

export function DiagnosisPage({ onComplete, onNavigate }: DiagnosisPageProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { questionId: string; knowledgePointId: string; correct: boolean }>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [agents, setAgents] = useState<AgentState[]>(getAgentStates());
  const fillInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const allQuestions = getQuestions();
    // 随机选择5题，覆盖不同知识点
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 5);
    setQuestions(selected);

    const unsub = subscribeToAgentStates(setAgents);
    return () => unsub();
  }, []);

  const currentQuestion = questions[currentIdx];
  const hasAnswered = currentQuestion ? answers[currentQuestion.id] !== undefined : false;
  const isCorrect = hasAnswered ? answers[currentQuestion.id].correct : false;

  const handleAnswer = (answer: string) => {
    if (!currentQuestion || hasAnswered) return;

    const correct = answer === currentQuestion.answer;
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: {
        questionId: currentQuestion.id,
        knowledgePointId: currentQuestion.knowledgePointId,
        correct,
      },
    }));
    setShowExplanation(true);
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setShowExplanation(false);
    } else {
      submitDiagnosis();
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx(prev => prev - 1);
      setShowExplanation(answers[questions[currentIdx - 1]?.id] !== undefined);
    }
  };

  const submitDiagnosis = async () => {
    setIsSubmitting(true);
    const answerList = Object.values(answers);
    const diagnosis = await runDiagnosis(answerList);
    setResult(diagnosis);
    setIsSubmitting(false);
    onComplete(diagnosis);
  };

  // 结果展示
  if (result) {
    const weakPointNames = result.weakPoints.map(id => getKnowledgePointById(id)?.name || id);
    const strongPointNames = result.strongPoints.map(id => getKnowledgePointById(id)?.name || id);

    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">诊断完成</h2>
          <p className="text-muted-foreground">
            整体水平：<span className="text-indigo-400 font-semibold">
              {result.overallLevel === 'beginner' ? '基础' : result.overallLevel === 'intermediate' ? '中等' : '进阶'}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* 薄弱点 */}
          <Card className="bg-card/50 border-border/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400" />
              薄弱点 ({weakPointNames.length})
            </h3>
            {weakPointNames.length > 0 ? (
              <div className="space-y-3">
                {weakPointNames.map((name, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <span className="text-white text-sm">{name}</span>
                    <span className="text-red-400 text-xs">
                      掌握度 {result.detailScores[result.weakPoints[i]]?.toFixed(0) || 0}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">暂无薄弱点，表现优秀！</p>
            )}
          </Card>

          {/* 优势点 */}
          <Card className="bg-card/50 border-border/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              优势点 ({strongPointNames.length})
            </h3>
            {strongPointNames.length > 0 ? (
              <div className="space-y-3">
                {strongPointNames.map((name, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-white text-sm">{name}</span>
                    <span className="text-emerald-400 text-xs">
                      掌握度 {result.detailScores[result.strongPoints[i]]?.toFixed(0) || 0}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">继续加油，发现你的优势！</p>
            )}
          </Card>
        </div>

        {/* 分数详情 */}
        <Card className="bg-card/50 border-border/50 p-6 mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">各知识点得分</h3>
          <div className="space-y-3">
            {Object.entries(result.detailScores).map(([kpId, score]) => {
              const kp = getKnowledgePointById(kpId);
              if (!kp) return null;
              return (
                <div key={kpId}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white">{kp.name}</span>
                    <span className={score >= 60 ? 'text-emerald-400' : 'text-red-400'}>{score.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        score >= 60 ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 下一步 */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            onClick={() => onNavigate('teaching')}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-8"
          >
            开始个性化教学
          </Button>
          <Button
            onClick={() => onNavigate('path')}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
          >
            查看学习路径
          </Button>
        </div>
      </div>
    );
  }

  if (questions.length === 0 || !currentQuestion) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">加载题目中...</p>
        </div>
      </div>
    );
  }

  const progress = ((currentIdx + 1) / questions.length) * 100;
  const kp = getKnowledgePointById(currentQuestion.knowledgePointId);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 进度条 */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-muted-foreground mb-2">
          <span>诊断测试</span>
          <span>{currentIdx + 1} / {questions.length}</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Agent状态 */}
      <div className="flex items-center gap-2 mb-6">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: getAgentColor('diagnostician') + '20' }}
        >
          <img src="/agent-diagnosis.png" alt="" className="w-5 h-5" />
        </div>
        <span className="text-sm text-muted-foreground">{getAgentName('diagnostician')}</span>
        {agents.find(a => a.type === 'diagnostician')?.status === 'running' && (
          <span className="text-xs text-amber-400 animate-pulse">分析中...</span>
        )}
      </div>

      {/* 题目卡片 */}
      <Card className="bg-card/50 border-border/50 p-6 md:p-8 mb-6">
        {/* 知识点标签 */}
        {kp && (
          <div className="mb-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs border border-indigo-500/20">
              {kp.category} · {kp.name}
            </span>
          </div>
        )}

        {/* 题目内容 */}
        <div className="mb-6">
          <h3 className="text-lg md:text-xl text-white leading-relaxed mb-2" dangerouslySetInnerHTML={{
            __html: renderLatex(currentQuestion.content)
          }} />
          <span className="text-xs text-muted-foreground">
            难度：{'★'.repeat(Math.max(0, Math.min(5, currentQuestion.difficulty)))}{'☆'.repeat(Math.max(0, 5 - Math.max(0, Math.min(5, currentQuestion.difficulty))))}
          </span>
        </div>

        {/* 选项 */}
        {currentQuestion.type === 'choice' && currentQuestion.options && (
          <div className="space-y-3">
            {currentQuestion.options.map((option, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(option)}
                disabled={hasAnswered}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                  hasAnswered && option === currentQuestion.answer
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                    : hasAnswered && answers[currentQuestion.id]?.questionId === currentQuestion.id && option !== currentQuestion.answer && !answers[currentQuestion.id].correct
                    ? 'bg-red-500/10 border-red-500/40 text-red-300'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20'
                } ${hasAnswered ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <span className="font-mono text-sm mr-3 text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
                <span dangerouslySetInnerHTML={{ __html: renderLatex(option) }} />
                {hasAnswered && option === currentQuestion.answer && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 inline ml-2" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* 填空题 */}
        {currentQuestion.type === 'fill_blank' && !hasAnswered && (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="输入你的答案..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAnswer((e.target as HTMLInputElement).value);
                }
              }}
              ref={fillInputRef}
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50"
            />
            <Button
              onClick={() => {
                if (fillInputRef.current) handleAnswer(fillInputRef.current.value);
              }}
              className="bg-indigo-500 hover:bg-indigo-600 text-white"
            >
              提交答案
            </Button>
          </div>
        )}

        {/* 答案解析 */}
        {showExplanation && (
          <div className={`mt-6 p-4 rounded-xl border ${
            isCorrect ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {isCorrect ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={isCorrect ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                {isCorrect ? '回答正确' : '回答错误'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{
              __html: renderLatex(currentQuestion.explanation)
            }} />
          </div>
        )}
      </Card>

      {/* 导航按钮 */}
      <div className="flex justify-between">
        <Button
          onClick={handlePrev}
          disabled={currentIdx === 0}
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          上一题
        </Button>

        {hasAnswered && (
          <Button
            onClick={handleNext}
            className="bg-indigo-500 hover:bg-indigo-600 text-white"
          >
            {currentIdx < questions.length - 1 ? '下一题' : '提交诊断'}
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>

      {/* 提交中 */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin mx-auto mb-4" />
            <p className="text-white">诊断Agent正在分析你的答题数据...</p>
            <p className="text-sm text-muted-foreground mt-2">Go goroutine并发处理中</p>
          </div>
        </div>
      )}
    </div>
  );
}

function sanitizeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function renderLatex(text: string): string {
  const sanitized = sanitizeHtml(text);
  return sanitized
    .replace(/\\lim_{(.*?)}/g, 'lim<sub>$1</sub>')
    .replace(/\\to/g, '→')
    .replace(/\\frac{(.*?)}{(.*?)}/g, '($1)/($2)')
    .replace(/\\int_{(.*?)}{(.*?)}/g, '∫<sub>$1</sub><sup>$2</sup>')
    .replace(/\\int/g, '∫')
    .replace(/\\sin/g, 'sin')
    .replace(/\\cos/g, 'cos')
    .replace(/\\ln/g, 'ln')
    .replace(/\\pi/g, 'π')
    .replace(/\\cdot/g, '·')
    .replace(/\\infty/g, '∞')
    .replace(/\\sum_{(.*?)}/g, '∑<sub>$1</sub>')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\,/g, ' ')
    .replace(/\\/g, '');
}

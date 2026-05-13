import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';

const COGNITIVE_API = import.meta.env.VITE_COGNITIVE_API_URL || 'http://localhost:8002';

interface Misconception {
  concept: string;
  name: string;
  freq: number;
  root: string;
}

interface DiagnosisInfo {
  topic: string;
  current_mastery: number;
  misconceptions: Misconception[];
  prerequisites: string[];
  missing_prerequisites: string[];
}

interface LearningStep {
  order: number;
  type: 'concept' | 'example' | 'practice' | 'summary' | 'review';
  concept: string;
  duration_minutes: number;
  description: string;
}

interface LearningPlan {
  steps: LearningStep[];
  total_minutes: number;
  strategy: string;
  focus: string;
  current_step_index: number;
}

interface CognitivePanelProps {
  studentId: string;
  topic: string;
  onTeachingStep?: (step: LearningStep) => void;
}

export function CognitivePanel({ studentId, topic, onTeachingStep }: CognitivePanelProps) {
  const [diagnosis, setDiagnosis] = useState<DiagnosisInfo | null>(null);
  const [plan, setPlan] = useState<LearningPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (topic) {
      runDiagnosis();
    }
  }, [topic]);

  async function runDiagnosis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${COGNITIVE_API}/api/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, topic }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        setDiagnosis(data);
        generatePlan(data);
      } else {
        setError('诊断请求失败');
      }
    } catch {
      setError('无法连接认知诊断服务');
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan(diagnosisData: DiagnosisInfo) {
    try {
      const res = await fetch(`${COGNITIVE_API}/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, diagnosis: diagnosisData }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        setPlan(data);
      }
    } catch {
      // Plan generation failure is non-critical, silently ignore
    }
  }

  function getMasteryColor(level: number): string {
    if (level >= 0.7) return 'bg-green-500';
    if (level >= 0.4) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  function getMasteryLabel(level: number): string {
    if (level >= 0.9) return '精通';
    if (level >= 0.7) return '掌握';
    if (level >= 0.4) return '了解';
    return '薄弱';
  }

  function getStepTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      concept: '📖 概念讲解',
      example: '📝 例题演示',
      practice: '✏️ 练习',
      summary: '📋 总结',
      review: '🔄 复习',
    };
    return labels[type] || type;
  }

  return (
    <Card className="p-4 bg-white/5 border border-white/10 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white/80">🧠 认知诊断面板</h3>
        <button
          onClick={runDiagnosis}
          disabled={loading}
          className="text-xs px-2 py-1 bg-indigo-500/30 hover:bg-indigo-500/50 text-white/70 rounded transition disabled:opacity-50"
        >
          {loading ? '诊断中...' : '重新诊断'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 mb-3 p-2 bg-red-500/10 rounded">{error}</div>
      )}

      {diagnosis && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">知识点：{diagnosis.topic}</span>
            <span className="text-xs text-white/60">
              掌握度：
              <span className={`inline-block w-16 h-1.5 rounded-full bg-white/10 ml-1 align-middle`}>
                <span
                  className={`block h-full rounded-full ${getMasteryColor(diagnosis.current_mastery)}`}
                  style={{ width: `${diagnosis.current_mastery * 100}%` }}
                />
              </span>
              <span className="ml-1 text-white/80">{getMasteryLabel(diagnosis.current_mastery)}</span>
            </span>
          </div>

          {diagnosis.misconceptions.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-yellow-400">⚠️ 常见错误模式：</span>
              {diagnosis.misconceptions.map((m, i) => (
                <div key={i} className="text-xs text-white/60 pl-3">
                  • {m.name}
                  <span className="text-white/40 ml-1">({(m.freq * 100).toFixed(0)}%学生)</span>
                  <div className="text-red-400/60 pl-3">根本原因：{m.root}</div>
                </div>
              ))}
            </div>
          )}

          {diagnosis.missing_prerequisites.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-orange-400">🔗 前置知识缺失：</span>
              <div className="flex flex-wrap gap-1 pl-3">
                {diagnosis.missing_prerequisites.map((p, i) => (
                  <span key={i} className="text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-300 rounded">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {plan && (
            <div className="space-y-1 mt-3 pt-3 border-t border-white/10">
              <span className="text-xs text-indigo-400">📋 学习路径（{plan.total_minutes}分钟）：</span>
              {plan.steps.map((step, i) => (
                <div
                  key={i}
                  className={`text-xs pl-3 py-0.5 cursor-pointer hover:bg-white/5 rounded ${
                    i === plan.current_step_index ? 'text-indigo-300 font-medium' : 'text-white/50'
                  }`}
                  onClick={() => onTeachingStep?.(step)}
                >
                  {i === plan.current_step_index ? '▶ ' : '  '}
                  {getStepTypeLabel(step.type)} - {step.description}
                  <span className="text-white/30 ml-1">({step.duration_minutes}min)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!diagnosis && !error && !loading && (
        <div className="text-xs text-white/40 text-center py-4">
          选择知识点后将自动进行认知诊断
        </div>
      )}
    </Card>
  );
}

export type { DiagnosisInfo, LearningPlan, LearningStep, Misconception };

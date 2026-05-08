// ===== 前端 Agent 调度服务 =====
// 模拟 Go 调度器的 goroutine + channel 行为
// 实际部署时替换为 WebSocket 连接 Go 后端

import type {
  AgentType,
  AgentState,
  AgentMessage,
  DiagnosisResult,
  TeachingMessage,
  LearningPath,
  EvaluationReport,
} from '@/types';
import {
  getKnowledgePoints,
  getKnowledgePointById,
  getLearningRecords,
  initLearningRecords,
  logAgentMessage,
} from './database';

// ===== 常量 =====

const AGENT_CONFIG: Record<AgentType, { name: string; color: string; description: string }> = {
  diagnostician: { name: '诊断Agent', color: '#4f46e5', description: '认知诊断与薄弱点识别' },
  tutor: { name: '教学Agent', color: '#10b981', description: 'Socratic对话式教学' },
  planner: { name: '规划Agent', color: '#f59e0b', description: '个性化学习路径生成' },
  evaluator: { name: '评估Agent', color: '#ec4899', description: '学习进度与效果评估' },
};

// ===== 状态管理 =====

let agentStates: Record<AgentType, AgentState> = {
  diagnostician: { type: 'diagnostician', name: '诊断Agent', status: 'idle', icon: '/agent-diagnosis.png', color: '#4f46e5', description: '认知诊断与薄弱点识别', lastActive: 0, taskCount: 0 },
  tutor: { type: 'tutor', name: '教学Agent', status: 'idle', icon: '/agent-tutor.png', color: '#10b981', description: 'Socratic对话式教学', lastActive: 0, taskCount: 0 },
  planner: { type: 'planner', name: '规划Agent', status: 'idle', icon: '/agent-planner.png', color: '#f59e0b', description: '个性化学习路径生成', lastActive: 0, taskCount: 0 },
  evaluator: { type: 'evaluator', name: '评估Agent', status: 'idle', icon: '/agent-evaluator.png', color: '#ec4899', description: '学习进度与效果评估', lastActive: 0, taskCount: 0 },
};

const statusListeners: ((states: AgentState[]) => void)[] = [];
const messageListeners: ((msg: AgentMessage) => void)[] = [];

export function subscribeToAgentStates(listener: (states: AgentState[]) => void) {
  statusListeners.push(listener);
  return () => {
    const idx = statusListeners.indexOf(listener);
    if (idx >= 0) statusListeners.splice(idx, 1);
  };
}

export function subscribeToAgentMessages(listener: (msg: AgentMessage) => void) {
  messageListeners.push(listener);
  return () => {
    const idx = messageListeners.indexOf(listener);
    if (idx >= 0) messageListeners.splice(idx, 1);
  };
}

function updateAgentState(type: AgentType, status: AgentState['status']) {
  agentStates[type].status = status;
  agentStates[type].lastActive = Date.now();
  if (status === 'completed') {
    agentStates[type].taskCount++;
  }
  statusListeners.forEach(l => l(Object.values(agentStates)));
}

function emitAgentMessage(msg: AgentMessage) {
  logAgentMessage(msg);
  messageListeners.forEach(l => l(msg));
}

export function getAgentStates(): AgentState[] {
  return Object.values(agentStates);
}

// ===== 模拟 goroutine 调度 =====
// 使用 setTimeout 模拟 Go 的 goroutine 行为

function simulateGoroutine<T>(fn: () => Promise<T>, delay: number = 0): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => {
      fn().then(resolve);
    }, delay);
  });
}

// ===== 诊断Agent =====

export async function runDiagnosis(answers: { questionId: string; knowledgePointId: string; correct: boolean }[]): Promise<DiagnosisResult> {
  updateAgentState('diagnostician', 'running');

  // 模拟 Go 后端处理延迟
  await simulateGoroutine(async () => {
    // 发送开始诊断消息
    emitAgentMessage({
      id: `msg_${Date.now()}`,
      agent: 'diagnostician',
      content: '正在分析答题数据，识别知识薄弱点...',
      timestamp: Date.now(),
      metadata: { action: 'diagnose' },
    });
    return null;
  }, 300);

  // 模拟逐步分析
  await new Promise(r => setTimeout(r, 1200));

  const knowledgePoints = getKnowledgePoints();
  const scores: Record<string, number> = {};
  const weakPoints: string[] = [];
  const strongPoints: string[] = [];

  // 初始化所有知识点分数
  knowledgePoints.forEach(kp => {
    scores[kp.id] = 0;
  });

  // 计算各知识点得分
  const kpCorrect: Record<string, { correct: number; total: number }> = {};
  answers.forEach(ans => {
    if (!kpCorrect[ans.knowledgePointId]) {
      kpCorrect[ans.knowledgePointId] = { correct: 0, total: 0 };
    }
    kpCorrect[ans.knowledgePointId].total++;
    if (ans.correct) kpCorrect[ans.knowledgePointId].correct++;
  });

  Object.entries(kpCorrect).forEach(([kpId, stats]) => {
    const score = (stats.correct / stats.total) * 100;
    scores[kpId] = score;
    const kp = knowledgePoints.find(k => k.id === kpId);
    if (!kp) return;

    if (score < 60) {
      weakPoints.push(kpId);
      emitAgentMessage({
        id: `msg_${Date.now()}`,
        agent: 'diagnostician',
        content: `发现薄弱点：${kp.name}（掌握度 ${score.toFixed(0)}%）`,
        timestamp: Date.now(),
        metadata: { knowledgePoint: kpId, action: 'diagnose' },
      });
    } else {
      strongPoints.push(kpId);
    }
  });

  const correctCount = answers.filter(a => a.correct).length;
  let overallLevel: DiagnosisResult['overallLevel'] = 'intermediate';
  if (correctCount <= 2) overallLevel = 'beginner';
  else if (correctCount >= 4) overallLevel = 'advanced';

  const result: DiagnosisResult = {
    weakPoints,
    strongPoints,
    recommendedPath: weakPoints.length > 0 ? weakPoints : ['limit', 'derivative'],
    overallLevel,
    detailScores: scores,
  };

  emitAgentMessage({
    id: `msg_${Date.now()}`,
    agent: 'diagnostician',
    content: `诊断完成！整体水平：${overallLevel === 'beginner' ? '基础' : overallLevel === 'intermediate' ? '中等' : '进阶'}，发现 ${weakPoints.length} 个薄弱点`,
    timestamp: Date.now(),
    metadata: { action: 'diagnose' },
  });

  updateAgentState('diagnostician', 'completed');
  return result;
}

// ===== 教学Agent (Socratic) =====

const SOCRATIC_RESPONSES: Record<string, string[]> = {
  limit: [
    '极限是微积分的基础概念。让我们思考一下：当 x 越来越接近某个值时，f(x) 的行为是怎样的？',
    '很好的思路！那么你能用 ε-δ 语言描述一下极限的定义吗？',
    '正确！极限描述的是一种趋势，而不是函数在某一点的实际值。',
  ],
  derivative: [
    '导数描述的是函数的变化率。想象一下你在爬山，导数就是当前点的坡度。你觉得这个直觉对吗？',
    '正是如此！那么你能解释一下导数的几何意义吗？',
    '很好！导数就是切线的斜率。那么二阶导数代表什么呢？',
  ],
  integral: [
    '积分可以理解为无穷多个微小量的累加。你能想到生活中哪些场景可以用积分来描述吗？',
    '不错！定积分计算的是曲线下的面积。那么不定积分和定积分有什么区别呢？',
    '正确！不定积分是一族函数（有+C），而定积分是一个具体的数值。',
  ],
  default: [
    '这是一个很好的问题！让我们从另一个角度来思考：你觉得这个问题的核心概念是什么？',
    '不错！那么如果我们将条件稍微改变一下，结果会怎样呢？',
    '很好！你能用自己的话解释一下这个定理的含义吗？',
    '正确！那么下一步我们应该如何运用这个结论呢？',
    '接近了！想想我们之前学过的相关知识，有没有类似的解决方法？',
  ],
};

export async function sendTeachingMessage(
  message: string,
  knowledgePointId: string,
  history: TeachingMessage[]
): Promise<TeachingMessage> {
  updateAgentState('tutor', 'running');

  await new Promise(r => setTimeout(r, 800));

  const kp = getKnowledgePointById(knowledgePointId);
  let responses = SOCRATIC_RESPONSES[knowledgePointId] || SOCRATIC_RESPONSES.default;

  // 根据对话历史选择不同响应
  const historyLength = history.length;
  const responseIndex = historyLength % responses.length;
  let response = responses[responseIndex];

  // 如果是学生请求详细解释
  if (message.includes('详细') || message.includes('不懂') || message.includes('解释')) {
    response = kp
      ? `关于${kp.name}：${kp.description}。核心公式：${kp.formulas?.[0] || ''}。让我用一个例子来说明...`
      : '让我详细解释一下这个概念...';
  }

  // 如果是学生回答正确
  if (message.includes('对') || message.includes('正确') || message.includes('懂了')) {
    response = '太棒了！你的理解很到位。让我们继续深入，看看这个概念如何应用到更复杂的问题上？';
  }

  const tutorMessage: TeachingMessage = {
    id: `msg_${Date.now()}`,
    role: 'tutor',
    content: response,
    timestamp: Date.now(),
    type: 'text',
    metadata: {
      knowledgePoint: knowledgePointId,
      isSocratic: true,
    },
  };

  emitAgentMessage({
    id: tutorMessage.id,
    agent: 'tutor',
    content: response,
    timestamp: tutorMessage.timestamp,
    metadata: { knowledgePoint: knowledgePointId, action: 'teach' },
  });

  updateAgentState('tutor', 'completed');
  return tutorMessage;
}

// ===== 规划Agent =====

export async function generateLearningPath(diagnosis: DiagnosisResult, userId: string): Promise<LearningPath> {
  updateAgentState('planner', 'running');

  emitAgentMessage({
    id: `msg_${Date.now()}`,
    agent: 'planner',
    content: '正在根据诊断结果生成个性化学习路径...',
    timestamp: Date.now(),
    metadata: { action: 'plan' },
  });

  await new Promise(r => setTimeout(r, 1500));

  const knowledgePoints = getKnowledgePoints();
  const nodes: LearningPath['nodes'] = [];
  const edges: LearningPath['edges'] = [];

  // 优先排列薄弱点
  let order = 1;
  const added = new Set<string>();

  // 先添加薄弱点
  diagnosis.weakPoints.forEach(kpId => {
    const kp = knowledgePoints.find(k => k.id === kpId);
    if (!kp || added.has(kpId)) return;

    // 先添加前置知识点
    kp.prerequisites.forEach(prereqId => {
      if (!added.has(prereqId)) {
        const prereq = knowledgePoints.find(k => k.id === prereqId);
        if (prereq) {
          nodes.push({
            knowledgePointId: prereqId,
            status: 'available',
            estimatedTime: prereq.difficulty * 15,
            order: order++,
          });
          added.add(prereqId);
        }
      }
    });

    nodes.push({
      knowledgePointId: kpId,
      status: 'available',
      estimatedTime: kp.difficulty * 20,
      order: order++,
    });
    added.add(kpId);
  });

  // 生成边
  nodes.forEach((node, i) => {
    if (i < nodes.length - 1) {
      edges.push({
        from: node.knowledgePointId,
        to: nodes[i + 1].knowledgePointId,
        type: 'prerequisite',
      });
    }
  });

  const totalTime = nodes.reduce((sum, n) => sum + n.estimatedTime, 0);

  const path: LearningPath = {
    id: `path_${Date.now()}`,
    userId,
    nodes,
    edges,
    createdAt: Date.now(),
    estimatedTime: totalTime,
  };

  const kpNames = nodes.map(n => {
    const kp = knowledgePoints.find(k => k.id === n.knowledgePointId);
    return kp?.name || n.knowledgePointId;
  });

  emitAgentMessage({
    id: `msg_${Date.now()}`,
    agent: 'planner',
    content: `学习路径已生成！共 ${nodes.length} 个节点，预计 ${Math.ceil(totalTime / 60)} 小时。学习顺序：${kpNames.join(' → ')}`,
    timestamp: Date.now(),
    metadata: { action: 'plan' },
  });

  updateAgentState('planner', 'completed');
  return path;
}

// ===== 评估Agent =====

export async function generateEvaluationReport(userId: string): Promise<EvaluationReport> {
  updateAgentState('evaluator', 'running');

  emitAgentMessage({
    id: `msg_${Date.now()}`,
    agent: 'evaluator',
    content: '正在综合分析学习数据，生成评估报告...',
    timestamp: Date.now(),
    metadata: { action: 'evaluate' },
  });

  await new Promise(r => setTimeout(r, 1200));

  const records = getLearningRecords(userId);
  const knowledgePoints = getKnowledgePoints();

  const categoryScores: Record<string, number> = {};
  const knowledgeMastery: Record<string, number> = {};
  const trends: EvaluationReport['trends'] = [];

  // 按分类统计
  const categoryStats: Record<string, { total: number; sum: number }> = {};

  records.forEach(record => {
    const kp = knowledgePoints.find(k => k.id === record.knowledgePointId);
    if (!kp) return;

    knowledgeMastery[kp.id] = record.masteryLevel * 100;

    if (!categoryStats[kp.category]) {
      categoryStats[kp.category] = { total: 0, sum: 0 };
    }
    categoryStats[kp.category].total++;
    categoryStats[kp.category].sum += record.score;
  });

  Object.entries(categoryStats).forEach(([cat, stats]) => {
    categoryScores[cat] = stats.total > 0 ? stats.sum / stats.total : 0;
  });

  // 生成趋势数据
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i * 3);
    trends.push({
      date: date.toISOString().slice(0, 10),
      score: 50 + Math.random() * 40,
      questions: Math.floor(5 + Math.random() * 15),
    });
  }

  const overallScore = Object.values(categoryScores).reduce((a, b) => a + b, 0) /
    Math.max(Object.values(categoryScores).length, 1);

  const report: EvaluationReport = {
    id: `report_${Date.now()}`,
    userId,
    generatedAt: Date.now(),
    overallScore: Math.round(overallScore),
    categoryScores,
    knowledgeMastery,
    trends,
    suggestions: generateSuggestions(records, knowledgePoints),
    timeSpent: Math.floor(120 + Math.random() * 200),
    questionsAnswered: 50 + Math.floor(Math.random() * 50),
    accuracy: 0.65 + Math.random() * 0.25,
  };

  emitAgentMessage({
    id: `msg_${Date.now()}`,
    agent: 'evaluator',
    content: `评估报告已生成！综合得分 ${Math.round(overallScore)} 分，已生成个性化学习建议。`,
    timestamp: Date.now(),
    metadata: { action: 'evaluate' },
  });

  updateAgentState('evaluator', 'completed');
  return report;
}

function generateSuggestions(records: import('@/types').LearningRecord[], knowledgePoints: import('@/types').KnowledgePoint[]): string[] {
  const weakKps = records
    .filter(r => r.score < 60)
    .map(r => knowledgePoints.find(kp => kp.id === r.knowledgePointId)?.name)
    .filter(Boolean);

  const strongKps = records
    .filter(r => r.score >= 80)
    .map(r => knowledgePoints.find(kp => kp.id === r.knowledgePointId)?.name)
    .filter(Boolean);

  const suggestions: string[] = [];

  if (weakKps.length > 0) {
    suggestions.push(`建议加强${weakKps.slice(0, 2).join('、')}的基础概念练习`);
  }
  if (strongKps.length > 0) {
    suggestions.push(`${strongKps.slice(0, 2).join('、')}掌握良好，可继续深入学习相关内容`);
  }
  suggestions.push('建议每天保持30分钟以上的学习时间，持续巩固所学知识');

  return suggestions;
}

// ===== 工具函数 =====

export function getAgentIcon(type: AgentType): string {
  return agentStates[type]?.icon || '/agent-tutor.png';
}

export function getAgentColor(type: AgentType): string {
  return AGENT_CONFIG[type]?.color || '#4f46e5';
}

export function getAgentName(type: AgentType): string {
  return AGENT_CONFIG[type]?.name || type;
}

// 初始化用户学习记录
export function initUserLearning(userId: string) {
  initLearningRecords(userId);
}

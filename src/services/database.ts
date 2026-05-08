// ===== 轻量级数据层 (SQLite 模拟) =====
// 使用 localStorage + JSON 实现持久化
// 实际部署时替换为真实 SQLite

import type {
  User,
  Question,
  KnowledgePoint,
  LearningRecord,
  LearningPath,
  EvaluationReport,
  TeachingSession,
  AgentMessage,
} from '@/types';

const DB_KEYS = {
  users: 'edumind_users',
  questions: 'edumind_questions',
  knowledgePoints: 'edumind_knowledge',
  learningRecords: 'edumind_records',
  learningPaths: 'edumind_paths',
  evaluationReports: 'edumind_reports',
  teachingSessions: 'edumind_sessions',
  agentLogs: 'edumind_agent_logs',
  currentUser: 'edumind_current_user',
};

// ===== 用户管理 =====

export function createUser(username: string, learningStyle: User['learningStyle'] = 'logical'): User {
  const user: User = {
    id: `user_${Date.now()}`,
    username,
    createdAt: Date.now(),
    learningStyle,
  };
  const users = getUsers();
  users.push(user);
  localStorage.setItem(DB_KEYS.users, JSON.stringify(users));
  localStorage.setItem(DB_KEYS.currentUser, JSON.stringify(user));
  return user;
}

export function getUsers(): User[] {
  const data = localStorage.getItem(DB_KEYS.users);
  return data ? JSON.parse(data) : [];
}

export function getCurrentUser(): User | null {
  const data = localStorage.getItem(DB_KEYS.currentUser);
  return data ? JSON.parse(data) : null;
}

// ===== 题库管理 =====

export function initQuestions(): void {
  if (localStorage.getItem(DB_KEYS.questions)) return;
  
  const questions: Question[] = [
    // ===== 极限与连续 =====
    {
      id: 'q_limit_1',
      knowledgePointId: 'limit',
      type: 'choice',
      content: '求极限：\\lim_{x \\to 0} \\frac{\\sin x}{x}',
      options: ['0', '1', '不存在', '∞'],
      answer: '1',
      explanation: '这是重要极限之一，利用夹逼定理或泰勒展开可证明 \\lim_{x \\to 0} \\frac{\\sin x}{x} = 1',
      difficulty: 2,
      tags: ['极限', '三角函数'],
    },
    {
      id: 'q_limit_2',
      knowledgePointId: 'limit',
      type: 'fill_blank',
      content: '求极限：\\lim_{x \\to \\infty} \\left(1 + \\frac{1}{x}\\right)^x = _______',
      answer: 'e',
      explanation: '这是自然常数 e 的定义之一，\\lim_{x \\to \\infty} \\left(1 + \\frac{1}{x}\\right)^x = e ≈ 2.71828...',
      difficulty: 3,
      tags: ['极限', '自然常数'],
    },
    {
      id: 'q_continuity_1',
      knowledgePointId: 'continuity',
      type: 'choice',
      content: '函数 f(x) 在点 x₀ 处连续的定义是：',
      options: [
        '\\lim_{x \\to x₀} f(x) 存在',
        'f(x₀) 有定义',
        '\\lim_{x \\to x₀} f(x) = f(x₀)',
        'f(x) 在 x₀ 处可导',
      ],
      answer: '\\lim_{x \\to x₀} f(x) = f(x₀)',
      explanation: '连续性三要素：① f(x₀) 有定义 ② 极限存在 ③ 极限值等于函数值',
      difficulty: 2,
      tags: ['连续', '极限'],
    },
    // ===== 导数与微分 =====
    {
      id: 'q_derivative_1',
      knowledgePointId: 'derivative',
      type: 'choice',
      content: '函数 f(x) = x³ 在 x = 2 处的导数是：',
      options: ['6', '8', '12', '4'],
      answer: '12',
      explanation: 'f\'(x) = 3x²，所以 f\'(2) = 3 × 4 = 12',
      difficulty: 1,
      tags: ['导数', '幂函数'],
    },
    {
      id: 'q_derivative_2',
      knowledgePointId: 'derivative',
      type: 'fill_blank',
      content: '求导：\\frac{d}{dx}(e^{x} \\cdot \\ln x) = _______',
      answer: 'e^x(ln x + 1/x)',
      explanation: '使用乘积法则：(uv)\' = u\'v + uv\'，其中 u = eˣ, v = ln x',
      difficulty: 3,
      tags: ['导数', '乘积法则', '指数函数'],
    },
    {
      id: 'q_chain_rule_1',
      knowledgePointId: 'chain_rule',
      type: 'choice',
      content: '设 y = \\sin(x²)，则 \\frac{dy}{dx} = ?',
      options: [
        '\\cos(x²)',
        '2x \\cdot \\cos(x²)',
        '2x \\cdot \\sin(x)',
        '\\cos(2x)',
      ],
      answer: '2x \\cdot \\cos(x²)',
      explanation: '链式法则：\\frac{dy}{dx} = \\cos(x²) \\cdot 2x = 2x\\cos(x²)',
      difficulty: 3,
      tags: ['链式法则', '三角函数', '复合函数'],
    },
    // ===== 积分 =====
    {
      id: 'q_integral_1',
      knowledgePointId: 'indefinite_integral',
      type: 'fill_blank',
      content: '求不定积分：\\int x² dx = _______ + C',
      answer: 'x^3/3',
      explanation: '使用幂函数积分公式：\\int xⁿ dx = \\frac{x^{n+1}}{n+1} + C (n ≠ -1)',
      difficulty: 1,
      tags: ['不定积分', '幂函数'],
    },
    {
      id: 'q_integral_2',
      knowledgePointId: 'definite_integral',
      type: 'choice',
      content: '计算：\\int_{0}^{\\pi} \\sin x \\, dx = ?',
      options: ['0', '1', '2', '-2'],
      answer: '2',
      explanation: '\\int_{0}^{\\pi} \\sin x \\, dx = [-\\cos x]_{0}^{\\pi} = -(-1) - (-1) = 2',
      difficulty: 2,
      tags: ['定积分', '三角函数'],
    },
    {
      id: 'q_integration_by_parts_1',
      knowledgePointId: 'integration_by_parts',
      type: 'choice',
      content: '使用分部积分法求 \\int x \\cdot e^x \\, dx，应设：',
      options: [
        'u = eˣ, dv = x dx',
        'u = x, dv = eˣ dx',
        'u = x·eˣ, dv = dx',
        'u = 1, dv = x·eˣ dx',
      ],
      answer: 'u = x, dv = eˣ dx',
      explanation: '分部积分选择 u 的原则（LIATE法则）：对数 < 反三角 < 代数 < 三角 < 指数，所以选 u = x',
      difficulty: 3,
      tags: ['分部积分', 'LIATE法则'],
    },
    // ===== 级数 =====
    {
      id: 'q_series_1',
      knowledgePointId: 'series',
      type: 'choice',
      content: '级数 \\sum_{n=1}^{\\infty} \\frac{1}{n²} 的和是：',
      options: ['\\frac{\\pi}{6}', '\\frac{\\pi²}{6}', '\\frac{\\pi}{3}', '发散'],
      answer: '\\frac{\\pi²}{6}',
      explanation: '这是巴塞尔问题，由欧拉证明：\\sum_{n=1}^{\\infty} \\frac{1}{n²} = \\frac{\\pi²}{6}',
      difficulty: 4,
      tags: ['级数', 'p-级数', '巴塞尔问题'],
    },
    // ===== 微分方程 =====
    {
      id: 'q_ode_1',
      knowledgePointId: 'ode',
      type: 'fill_blank',
      content: '微分方程 y\' = ky 的通解为 y = _______',
      answer: 'Ce^{kx}',
      explanation: '一阶线性齐次微分方程，分离变量积分得 ln|y| = kx + C₁，即 y = Ce^{kx}',
      difficulty: 2,
      tags: ['微分方程', '分离变量'],
    },
    // ===== 多元函数 =====
    {
      id: 'q_partial_derivative_1',
      knowledgePointId: 'partial_derivative',
      type: 'choice',
      content: '设 f(x,y) = x²y + y³，则 \\frac{\\partial f}{\\partial x} = ?',
      options: ['2xy', 'x² + 3y²', '2xy + y³', 'x²'],
      answer: '2xy',
      explanation: '对 x 求偏导时，将 y 视为常数：\\frac{\\partial f}{\\partial x} = 2xy',
      difficulty: 2,
      tags: ['偏导数', '多元函数'],
    },
  ];
  
  localStorage.setItem(DB_KEYS.questions, JSON.stringify(questions));
}

export function getQuestions(): Question[] {
  initQuestions();
  const data = localStorage.getItem(DB_KEYS.questions);
  return data ? JSON.parse(data) : [];
}

export function getQuestionsByKnowledgePoint(kpId: string): Question[] {
  return getQuestions().filter(q => q.knowledgePointId === kpId);
}

export function getQuestionById(id: string): Question | undefined {
  return getQuestions().find(q => q.id === id);
}

// ===== 知识图谱管理 =====

export function initKnowledgeGraph(): void {
  if (localStorage.getItem(DB_KEYS.knowledgePoints)) return;
  
  const points: KnowledgePoint[] = [
    {
      id: 'limit',
      name: '极限',
      category: '微积分基础',
      difficulty: 2,
      description: '函数极限的概念、性质与计算方法',
      prerequisites: [],
      related: ['continuity', 'derivative'],
      formulas: ['\\lim_{x \\to x₀} f(x) = L', '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'],
      position: { x: 200, y: 100 },
    },
    {
      id: 'continuity',
      name: '连续',
      category: '微积分基础',
      difficulty: 2,
      description: '函数连续性的定义与间断点分类',
      prerequisites: ['limit'],
      related: ['derivative'],
      formulas: ['\\lim_{x \\to x₀} f(x) = f(x₀)'],
      position: { x: 400, y: 100 },
    },
    {
      id: 'derivative',
      name: '导数',
      category: '微分学',
      difficulty: 2,
      description: '导数的定义、几何意义与基本求导法则',
      prerequisites: ['limit', 'continuity'],
      related: ['chain_rule', 'application_derivative'],
      formulas: ['f\'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}'],
      position: { x: 600, y: 100 },
    },
    {
      id: 'chain_rule',
      name: '链式法则',
      category: '微分学',
      difficulty: 3,
      description: '复合函数求导法则',
      prerequisites: ['derivative'],
      related: ['implicit_derivative'],
      formulas: ['\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}'],
      position: { x: 800, y: 50 },
    },
    {
      id: 'application_derivative',
      name: '导数应用',
      category: '微分学',
      difficulty: 3,
      description: '单调性、极值、最值与凹凸性',
      prerequisites: ['derivative'],
      related: ['taylor'],
      formulas: ['f\'(x) = 0 ⇒ 驻点', 'f"(x) > 0 ⇒ 凹函数'],
      position: { x: 800, y: 150 },
    },
    {
      id: 'indefinite_integral',
      name: '不定积分',
      category: '积分学',
      difficulty: 2,
      description: '原函数与不定积分的概念',
      prerequisites: ['derivative'],
      related: ['definite_integral', 'integration_by_parts'],
      formulas: ['\\int f(x)dx = F(x) + C', '\\int xⁿ dx = \\frac{x^{n+1}}{n+1} + C'],
      position: { x: 200, y: 300 },
    },
    {
      id: 'definite_integral',
      name: '定积分',
      category: '积分学',
      difficulty: 3,
      description: '定积分的定义、性质与计算',
      prerequisites: ['indefinite_integral'],
      related: ['application_integral'],
      formulas: ['\\int_{a}^{b} f(x)dx = F(b) - F(a)', '牛顿-莱布尼茨公式'],
      position: { x: 400, y: 300 },
    },
    {
      id: 'integration_by_parts',
      name: '分部积分',
      category: '积分学',
      difficulty: 3,
      description: '分部积分法及其应用',
      prerequisites: ['indefinite_integral'],
      related: ['definite_integral'],
      formulas: ['\\int u dv = uv - \\int v du'],
      position: { x: 100, y: 400 },
    },
    {
      id: 'application_integral',
      name: '积分应用',
      category: '积分学',
      difficulty: 3,
      description: '面积、体积、弧长与物理应用',
      prerequisites: ['definite_integral'],
      related: [],
      formulas: ['A = \\int_{a}^{b} f(x)dx', 'V = \\pi \\int_{a}^{b} [f(x)]²dx'],
      position: { x: 600, y: 300 },
    },
    {
      id: 'series',
      name: '级数',
      category: '级数理论',
      difficulty: 4,
      description: '数项级数、幂级数与泰勒展开',
      prerequisites: ['limit', 'derivative'],
      related: ['taylor'],
      formulas: ['\\sum_{n=0}^{\\infty} arⁿ = \\frac{a}{1-r} (|r| < 1)', 'eˣ = \\sum_{n=0}^{\\infty} \\frac{xⁿ}{n!}'],
      position: { x: 800, y: 300 },
    },
    {
      id: 'taylor',
      name: '泰勒公式',
      category: '级数理论',
      difficulty: 4,
      description: '泰勒展开与麦克劳林展开',
      prerequisites: ['derivative', 'series'],
      related: [],
      formulas: ['f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)ⁿ'],
      position: { x: 900, y: 200 },
    },
    {
      id: 'ode',
      name: '微分方程',
      category: '微分方程',
      difficulty: 3,
      description: '一阶与二阶常微分方程',
      prerequisites: ['derivative', 'indefinite_integral'],
      related: [],
      formulas: ['y\' + P(x)y = Q(x)', '特征方程法'],
      position: { x: 500, y: 450 },
    },
    {
      id: 'partial_derivative',
      name: '偏导数',
      category: '多元函数',
      difficulty: 3,
      description: '多元函数的偏导数与全微分',
      prerequisites: ['derivative'],
      related: ['multiple_integral'],
      formulas: ['\\frac{\\partial f}{\\partial x} = \\lim_{h\\to 0} \\frac{f(x+h,y)-f(x,y)}{h}'],
      position: { x: 700, y: 450 },
    },
    {
      id: 'multiple_integral',
      name: '重积分',
      category: '多元函数',
      difficulty: 4,
      description: '二重积分与三重积分的计算',
      prerequisites: ['partial_derivative', 'definite_integral'],
      related: [],
      formulas: ['\\iint_D f(x,y) d\\sigma', '极坐标变换'],
      position: { x: 900, y: 450 },
    },
  ];
  
  localStorage.setItem(DB_KEYS.knowledgePoints, JSON.stringify(points));
}

export function getKnowledgePoints(): KnowledgePoint[] {
  initKnowledgeGraph();
  const data = localStorage.getItem(DB_KEYS.knowledgePoints);
  return data ? JSON.parse(data) : [];
}

export function getKnowledgePointById(id: string): KnowledgePoint | undefined {
  return getKnowledgePoints().find(kp => kp.id === id);
}

// ===== 学习记录管理 =====

export function getLearningRecords(userId: string): LearningRecord[] {
  const data = localStorage.getItem(DB_KEYS.learningRecords);
  const records: LearningRecord[] = data ? JSON.parse(data) : [];
  return records.filter(r => r.userId === userId);
}

export function updateLearningRecord(record: LearningRecord): void {
  const data = localStorage.getItem(DB_KEYS.learningRecords);
  const records: LearningRecord[] = data ? JSON.parse(data) : [];
  const idx = records.findIndex(r => r.id === record.id);
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.push(record);
  }
  localStorage.setItem(DB_KEYS.learningRecords, JSON.stringify(records));
}

export function initLearningRecords(userId: string): void {
  const points = getKnowledgePoints();
  const existing = getLearningRecords(userId);
  
  points.forEach(kp => {
    if (!existing.find(r => r.knowledgePointId === kp.id)) {
      const hasPrereqs = kp.prerequisites.length === 0 || 
        kp.prerequisites.every(prereq => {
          const prereqRecord = existing.find(r => r.knowledgePointId === prereq);
          return prereqRecord?.status === 'mastered';
        });
      
      updateLearningRecord({
        id: `rec_${userId}_${kp.id}`,
        userId,
        knowledgePointId: kp.id,
        status: hasPrereqs ? 'available' : 'locked',
        score: 0,
        attempts: 0,
        lastReview: 0,
        masteryLevel: 0.3,
      });
    }
  });
}

// ===== 学习路径管理 =====

export function saveLearningPath(path: LearningPath): void {
  const data = localStorage.getItem(DB_KEYS.learningPaths);
  const paths: LearningPath[] = data ? JSON.parse(data) : [];
  const idx = paths.findIndex(p => p.id === path.id);
  if (idx >= 0) {
    paths[idx] = path;
  } else {
    paths.push(path);
  }
  localStorage.setItem(DB_KEYS.learningPaths, JSON.stringify(paths));
}

export function getLearningPaths(userId: string): LearningPath[] {
  const data = localStorage.getItem(DB_KEYS.learningPaths);
  const paths: LearningPath[] = data ? JSON.parse(data) : [];
  return paths.filter(p => p.userId === userId);
}

// ===== 评估报告管理 =====

export function saveEvaluationReport(report: EvaluationReport): void {
  const data = localStorage.getItem(DB_KEYS.evaluationReports);
  const reports: EvaluationReport[] = data ? JSON.parse(data) : [];
  reports.push(report);
  localStorage.setItem(DB_KEYS.evaluationReports, JSON.stringify(reports));
}

export function getEvaluationReports(userId: string): EvaluationReport[] {
  const data = localStorage.getItem(DB_KEYS.evaluationReports);
  const reports: EvaluationReport[] = data ? JSON.parse(data) : [];
  return reports.filter(r => r.userId === userId);
}

// ===== 教学会话管理 =====

export function createTeachingSession(userId: string, knowledgePointId: string): TeachingSession {
  const session: TeachingSession = {
    id: `session_${Date.now()}`,
    userId,
    knowledgePointId,
    messages: [],
    startTime: Date.now(),
    lastActive: Date.now(),
    status: 'active',
  };
  const data = localStorage.getItem(DB_KEYS.teachingSessions);
  const sessions: TeachingSession[] = data ? JSON.parse(data) : [];
  sessions.push(session);
  localStorage.setItem(DB_KEYS.teachingSessions, JSON.stringify(sessions));
  return session;
}

export function getTeachingSession(sessionId: string): TeachingSession | undefined {
  const data = localStorage.getItem(DB_KEYS.teachingSessions);
  const sessions: TeachingSession[] = data ? JSON.parse(data) : [];
  return sessions.find(s => s.id === sessionId);
}

export function addTeachingMessage(sessionId: string, message: TeachingSession['messages'][0]): void {
  const data = localStorage.getItem(DB_KEYS.teachingSessions);
  const sessions: TeachingSession[] = data ? JSON.parse(data) : [];
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    session.messages.push(message);
    session.lastActive = Date.now();
    localStorage.setItem(DB_KEYS.teachingSessions, JSON.stringify(sessions));
  }
}

// ===== Agent 日志 =====

export function logAgentMessage(message: AgentMessage): void {
  const data = localStorage.getItem(DB_KEYS.agentLogs);
  const logs: AgentMessage[] = data ? JSON.parse(data) : [];
  logs.push(message);
  // 只保留最近 1000 条
  if (logs.length > 1000) {
    logs.splice(0, logs.length - 1000);
  }
  localStorage.setItem(DB_KEYS.agentLogs, JSON.stringify(logs));
}

export function getAgentLogs(agent?: string): AgentMessage[] {
  const data = localStorage.getItem(DB_KEYS.agentLogs);
  const logs: AgentMessage[] = data ? JSON.parse(data) : [];
  return agent ? logs.filter(l => l.agent === agent) : logs;
}

// ===== 工具函数 =====

export function clearDatabase(): void {
  Object.values(DB_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}

export { DB_KEYS };

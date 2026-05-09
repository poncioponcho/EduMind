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
    const score = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
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

// ===== 教学Agent (阶段式状态机) =====

type TeachingPhase = 'intro' | 'definition' | 'example' | 'practice' | 'summary';
type UserIntent = 'want_definition' | 'want_example' | 'continue' | 'confused' | 'student_answer' | 'greeting' | 'unknown';

interface TeachingStep {
  phase: TeachingPhase;
  content: string;
  socraticProbe?: string;
}

interface DialogState {
  userId: string;
  knowledgePoint: string;
  currentPhase: TeachingPhase;
  stepIndex: number;
  history: string[];
}

const dialogStates: Map<string, DialogState> = new Map();

const MAX_DIALOG_STATES = 50;
const MAX_HISTORY_SIZE = 20;

function cleanupDialogStates() {
  if (dialogStates.size > MAX_DIALOG_STATES) {
    const entries = Array.from(dialogStates.entries());
    entries.sort((a, b) => {
      const aTime = a[1].history.length > 0 ? 0 : 1;
      const bTime = b[1].history.length > 0 ? 0 : 1;
      return aTime - bTime;
    });
    const toDelete = entries.slice(0, dialogStates.size - MAX_DIALOG_STATES + 10);
    toDelete.forEach(([key]) => dialogStates.delete(key));
  }
}

const PHASE_ORDER: TeachingPhase[] = ['intro', 'definition', 'example', 'practice', 'summary'];

const PHASE_LABELS: Record<TeachingPhase, string> = {
  intro: '📍 引入',
  definition: '📖 定义',
  example: '✏️ 例题',
  practice: '🎯 练习',
  summary: '📋 总结',
};

const KNOWLEDGE_NAMES: Record<string, string> = {
  limit: '极限', derivative: '导数', chain_rule: '链式法则',
  indefinite_integral: '不定积分', definite_integral: '定积分',
  multiple_integral: '重积分', series: '级数', ode: '微分方程',
  partial_derivative: '偏导数', continuity: '连续性',
  integration_by_parts: '分部积分', taylor: '泰勒公式',
};

const TEACHING_CONTENT: Record<string, TeachingStep[]> = {
  limit: [
    { phase: 'intro', content: '极限是微积分的基石。今天我们来理解「当 x 无限趋近某个值时，f(x) 的行为」。', socraticProbe: '你之前学过函数图像吗？能想象一下x越来越接近某一点时，函数值会怎样变化？' },
    { phase: 'definition', content: '【定义】设 f(x) 在 x₀ 的去心邻域内有定义。若存在常数 L，对任意 ε>0，存在 δ>0，使 0<|x-x₀|<δ 时 |f(x)-L|<ε，则称 L 为 f(x) 在 x→x₀ 时的极限。记作 lim_{x→x₀}f(x)=L。', socraticProbe: '这个 ε-δ 定义看起来很抽象。你能用自己的话解释一下「任意小的误差」是什么意思吗？' },
    { phase: 'example', content: '【例1】求 lim_{x→0} sin(x)/x。\n解：这是微积分中最著名的极限之一！利用夹逼定理或泰勒展开可证明其值为 1。\n几何直观：单位圆中，弧长、正弦线、切线三者的关系。', socraticProbe: '如果题目变成 lim_{x→0} sin(2x)/x，你觉得结果会怎样？提示：可以用变量代换。' },
    { phase: 'practice', content: '【练习】请计算：lim_{x→∞} (1 + 1/x)^x\n提示：这和自然常数 e 的定义有关。想想 e ≈ 2.71828 是怎么来的？', socraticProbe: '你算出的答案是什么？能说说你的思路吗？' },
    { phase: 'summary', content: '【本节总结】\n① 极限描述的是一种「趋势」而非「到达」\n② 重要极限：sin(x)/x → 1 (x→0)，(1+1/x)^x → e (x→∞)\n③ 极限存在的充要条件：左右极限都存在且相等\n④ 下一步我们将学习连续性——它是极限的特殊情况（L = f(x₀)）' },
  ],
  derivative: [
    { phase: 'intro', content: '导数是研究变化率的工具。想象你在爬山，导数就是当前位置的坡度——告诉你往上走多陡。', socraticProbe: '如果坡度是0意味着什么？如果是负数呢？' },
    { phase: 'definition', content: '【定义】f\'(x₀) = lim_{h→0} [f(x₀+h) - f(x₀)] / h\n几何意义：曲线 y=f(x) 在点 (x₀, f(x₀)) 处**切线的斜率**\n物理意义：瞬时速度 = 位移对时间的导数', socraticProbe: '为什么 h 要趋近于0而不是等于0？如果h=0会发生什么？' },
    { phase: 'example', content: '【例】求 f(x)=x³ 在 x=2 处的导数。\n解：f\'(x) = 3x²（幂函数求导法则）\n所以 f\'(2) = 3×4 = 12\n验证：用定义计算 [f(2+h)-f(2)]/h = [(8+12h+6h²+h³)-8]/h = 12+6h+h² → 12', socraticProbe: '幂函数的通用求导公式 (xⁿ)\' = nx^{n-1}，你能用它快速求出 x^5 的导数吗？' },
    { phase: 'practice', content: '【练习】求导：d/dx[e^x · ln(x)]\n提示：这是两个函数相乘，需要用到什么法则？', socraticProbe: '你的答案是 e^x(1/x + ln x) 吗？乘积法则是 (uv)\' = u\'v + uv\'，检查一下每一步' },
    { phase: 'summary', content: '【本节总结】\n① 导数的本质是「瞬时变化率」= 差商的极限\n② 基本公式：(xⁿ)\'=nx^{n-1}, (eˣ)\'=eˣ, (ln x)\'=1/x\n③ 运算法则：和差法则、乘积法则(uv)\'=u\'v+uv\'、链式法则\n④ 链式法则处理复合函数，是下一节的重点' },
  ],
  chain_rule: [
    { phase: 'intro', content: '链式法则是求复合函数导数的「万能钥匙」——几乎所有复杂函数的求导最终都要归结到它。', socraticProbe: '你能举一个生活中「嵌套关系」的例子吗？比如穿衣服的过程？' },
    { phase: 'definition', content: '【链式法则】若 y=f(u), u=g(x)，则 dy/dx = dy/du · du/dx\n通俗记忆：「外层导 × 内层导」，像剥洋葱一样从外到内逐层求导\n符号写法：(f(g(x)))\' = f\'(g(x)) · g\'(x)', socraticProbe: '为什么是乘法关系而不是加法？想想变化率的传递——外层的变化由内层驱动' },
    { phase: 'example', content: '【例】求 y=sin(x²) 的导数。\n步骤1：识别结构 — 外层 sin(·)，内层 x²\n步骤2：外层导 — cos(x²)\n步骤3：内层导 — 2x\n结果：y\' = cos(x²) · 2x = 2x·cos(x²)', socraticProbe: '那 y = ln(sin(x)) 呢？这次内层和外层分别是什么？' },
    { phase: 'practice', content: '【练习】求 d/dx[√(1+x²)]\n即 y=(1+x²)^{1/2}\n提示：先确定外层函数和内层函数', socraticProbe: '答案应该是 x/√(1+x²)。对照一下：外层导是 (1/2)(1+x²)^{-1/2}，内层导是 2x' },
    { phase: 'summary', content: '【本节总结】\n① 链式法则核心：dy/dx = (dy/du)×(du/dx)\n② 操作步骤：识别嵌套 → 外层求导 × 内层求导\n③ 多层嵌套：从最外层开始，一层一层往里剥\n④ 常见陷阱：忘记乘内层导、混淆内外层顺序' },
  ],
  indefinite_integral: [
    { phase: 'intro', content: '不定积分是导数的逆运算。如果说导数是「拆解变化」，积分就是「累积总量」。', socraticProbe: '已知速度函数 v(t)，怎么求位移？这就是积分的思想起源' },
    { phase: 'definition', content: '【定义】若 F\'(x) = f(x)，则称 F 为 f 的一个原函数。全体原函数记为 ∫f(x)dx = F(x) + C\n其中 C 为任意常数（因为常数的导数为0）\n基本公式：∫xⁿdx = x^{n+1}/(n+1) + C (n≠-1)', socraticProbe: '为什么一定要加 +C？如果不加会有什么问题？' },
    { phase: 'example', content: '【例】求 ∫(3x² + 2x + 1)dx\n解：分项积分\n= 3·∫x²dx + 2·∫xdx + ∫1dx\n= 3·(x³/3) + 2·(x²/2) + x + C\n= x³ + x² + x + C', socraticProbe: '验证一下：对结果求导，看看能不能回到被积函数？' },
    { phase: 'practice', content: '【练习】求 ∫(e^x + 1/x) dx\n提示：e^x 的积分是什么？1/x 的积分又是什么特殊函数？', socraticProbe: '答案是 e^x + ln|x| + C。注意 1/x 的积分是 ln|x| 不是 ln(x)，为什么需要绝对值？' },
    { phase: 'summary', content: '【本节总结】\n① 不定积分 = 求原函数族（带+C）\n② 基本公式：∫xⁿdx=x^{n+1}/(n+1)+C, ∫eˣdx=eˣ+C, ∫(1/x)dx=ln|x|+C\n③ 线性性质：∫[af(x)+bg(x)]dx = a∫fdx + b∫gdx\n④ 下一步学习定积分——它给积分赋予了具体的数值意义' },
  ],
  definite_integral: [
    { phase: 'intro', content: '定积分回答的是具体问题：曲线下的面积到底有多大？不再是「一族函数」，而是一个确定的数值。', socraticProbe: '如果让你估算一个不规则图形的面积，你会用什么方法？' },
    { phase: 'definition', content: '【牛顿-莱布尼茨公式】∫_a^b f(x)dx = F(b) - F(a)\n其中 F 是 f 的任一原函数\n黎曼和思想：把区域分割成 n 个小矩形，宽度 Δx=(b-a)/n，高度 f(ξᵢ)，总面积 = Σf(ξᵢ)Δx，取 n→∞ 的极限', socraticProbe: '为什么定积分的结果是一个数而不带 +C？上下限代入后 C 会被怎样？' },
    { phase: 'example', content: '【例】计算 ∫_0^π sin(x)dx\n解：原函数 F(x) = -cos(x)\nF(π) - F(0) = (-cosπ) - (-cos0) = (-(-1)) - (-1) = 1 + 1 = 2\n几何验证：sin(x) 在 [0,π] 上非负，面积为 2，符合直觉', socraticProbe: '如果积分区间改成 [0, 2π]，结果会是多少？画图看看正弦曲线在两个周期内的表现' },
    { phase: 'practice', content: '【练习】计算 ∫_0^1 x²dx\n先用定义（黎曼和的极限），再用牛顿-莱布尼茨公式验证', socraticProbe: '答案是 1/3。用两种方法做出来了吗？体会一下公式的威力' },
    { phase: 'summary', content: '【本节总结】\n① 定积分 = 数值（面积/物理量），不定积分 = 函数族\n② 牛顿-莱布尼茨公式连接了两者：∫_a^b fdx = F(b)-F(a)\n③ 定积分性质：线性、区间可加性、保号性\n④ 下一步：换元积分法和分部积分法——处理更复杂的被积函数' },
  ],
  multiple_integral: [
    { phase: 'intro', content: '二重积分是一元定积分向二维的自然推广。我们不再计算「曲线下方的面积」，而是计算「曲面下方曲顶柱体的体积」。', socraticProbe: '一维积分算的是面积（二维概念），二维积分算的是体积（三维概念）。这个规律继续下去会怎样？' },
    { phase: 'definition', content: '【定义】∬_D f(x,y)dσ = lim_{λ→0} Σf(ξᵢ,ηᵢ)Δσᵢ\n其中 D 是 xy 平面上的有界闭区域，dσ 是面积元素\n累次积分（Fubini 定理）：∬_D fdσ = ∫[∫f(x,y)dx]dy = ∫[∫f(x,y)dy]dx', socraticProbe: '累次积分可以交换次序吗？什么条件下可以？这叫什么定理？' },
    { phase: 'example', content: '【例】计算 ∬_D (x+y)dσ，D=[0,1]×[0,1]\n解：先对y积分：∫_0^1 (x+y)dy = [xy + y²/2]_0^1 = x + 1/2\n再对x积分：∫_0^1 (x + 1/2)dx = [x²/2 + x/2]_0^1 = 1/2 + 1/2 = 1', socraticProbe: '如果交换积分次序，先x后y，结果会变吗？试一下验证 Fubini 定理' },
    { phase: 'practice', content: '【练习】计算 ∬_D x²y dσ，其中 D=[0,2]×[1,3]\n第一步应该先对哪个变量积分？有没有偏好？', socraticProbe: '答案是 16。计算过程：∫_0^2 x²dx · ∫_1^3 ydy = [8/3] · [4] = 32/3... 等等，再仔细算一遍？' },
    { phase: 'summary', content: '【本节总结】\n① 二重积分 = 曲顶柱体体积，累次积分是计算工具\n② Fubini 定理：在矩形域上积分次序可交换\n③ 积分次序选择技巧：看哪个变量的积分更简单\n④ 极坐标变换：x=r cosθ, y=r sinθ, dσ=r dr dθ（用于圆形区域）' },
  ],
  series: [
    { phase: 'intro', content: '级数是「无穷多项之和」的概念。看似简单，却蕴含着数学史上一些最美妙的发现——比如欧拉解决巴塞尔问题的故事。', socraticProbe: '无穷多个正数相加，结果一定是无穷大吗？想一想 1 + 1/2 + 1/4 + 1/8 + ... ？' },
    { phase: 'definition', content: '【p-级数】Σ_{n=1}^∞ 1/n^p\n- p > 1 时收敛（如 p=2 时 Σ1/n² = π²/6，欧拉1735年证明）\n- p ≤ 1 时发散（如调和级数 Σ1/n 发散到 +∞）\n比值判别法：若 lim|a_{n+1}/a_n| = L < 1 则收敛；L > 1 则发散', socraticProbe: '调和级数 Σ1/n 发散这件事违反直觉——通项趋于0但和却是无穷大。你怎么理解这个矛盾？' },
    { phase: 'example', content: '【例】判断 Σ_{n=1}^∞ 1/n² 的敛散性\n这是 p=2 的p级数，p>1，故收敛。\n欧拉的惊人发现：Σ1/n² = π²/6 ≈ 1.644934...', socraticProbe: '为什么结果是 π²/6 而不是别的常数？这暗示了自然数与圆周率之间有深刻的联系' },
    { phase: 'practice', content: '【练习】判断以下级数的敛散性：Σ_{n=1}^∞ n/2^n\n提示：试试比值判别法，计算 a_{n+1}/a_n 的极限', socraticProbe: '极限是 1/2 < 1，所以收敛。比值判别法的直观含义是什么？' },
    { phase: 'summary', content: '【本节总结】\n① 级数敛散性的核心判别法：比较判别法、比值判别法、根值判别法\n② 重要结论：p级数在 p>1 收敛，调和级数(p=1)发散\n③ 幂级数 Σaₙ(x-x₀)ⁿ 有收敛半径 R\n④ 泰勒级数将函数展开为无穷多项之和：e^x = Σxⁿ/n!' },
  ],
  ode: [
    { phase: 'intro', content: '微分方程是含未知函数及其导数的方程。它是数学建模的核心工具——从人口增长到热传导，从电路分析到传染病模型。', socraticProbe: '你能想到哪些日常现象可以用微分方程来描述？' },
    { phase: 'definition', content: '【一阶线性齐次 ODE】y\' + P(x)y = 0\n通解：y = Ce^{-∫P(x)dx}\n分离变量法：dy/y = -P(x)dx → 两边积分\n【一阶线性非齐次】y\' + P(x)y = Q(x)\n通解：y = e^{-∫Pdx}[∫Q·e^{∫Pdx}dx + C]', socraticProbe: '为什么齐次方程的解只有一个任意常数C？这与方程的阶数有什么关系？' },
    { phase: 'example', content: '【例】求解 y\' = ky（指数增长/衰减模型）\ndy/dt = ky → dy/y = kdt → ln|y| = kt + C₁ → y = Ce^{kt}\n应用：k>0 为指数增长（如细菌繁殖），k<0 为指数衰减（如放射性衰变）', socraticProbe: '如果初始条件 y(0) = y₀，那么 C 应该取多少？半衰期如何从这个公式推导？' },
    { phase: 'practice', content: '【练习】求解初值问题：y\' + 2xy = x，y(0) = 1\n这是一阶线性非齐次方程，先求积分因子 μ(x) = e^{∫2xdx}', socraticProbe: '通解是 y = 1/2 + (1/2)e^{-x²}。代入初始条件验证一下' },
    { phase: 'summary', content: '【本节总结】\n① 一阶ODE的基本解法：分离变量法、积分因子法、常数变易法\n② 解的结构：通解 = 齐次通解 + 特解\n③ 常见模型：指数增长/衰减、冷却定律、logistic 增长\n④ 二阶ODE（下一阶）：特征方程法，涉及振动和波动现象' },
  ],
  partial_derivative: [
    { phase: 'intro', content: '偏导数处理的是多元函数——当一个函数依赖多个变量时，我们如何衡量它在每个方向上的变化率？', socraticProbe: '如果你站在山坡上，朝不同方向走，坡度可能完全一样也可能不同。偏导数就是固定方向测量的坡度' },
    { phase: 'definition', content: '【定义】∂f/∂x = lim_{h→0} [f(x+h,y) - f(x,y)] / h\n关键：对 x 求偏导时，将 y 视为**常数**\n二阶偏导：∂²f/∂x², ∂²f/∂y∂x（混合偏导）\nClairaut 定理：若混合偏导连续，则 ∂²f/∂x∂y = ∂²f/∂y∂x', socraticProbe: 'Clairaut 定理说明求导顺序不影响结果。这在物理上有什么对应的意义？' },
    { phase: 'example', content: '【例】f(x,y) = x²y + y³，求 ∂f/∂x 和 ∂f/∂y\n∂f/∂x = 2x（y 视为常数，y³ 的导数为 0）\n∂f/∂y = x² + 3y²（x 视为常数，x²y 对 y 求导得 x²）', socraticProbe: '那 ∂²f/∂x∂y 呢？先对 x 再对 y，或者反过来，结果相同吗？' },
    { phase: 'practice', content: '【练习】f(x,y) = e^(xy) + sin(x+y)\n求 ∂f/∂x, ∂f/∂y, 以及 ∂²f/∂x∂y\n提示：e^(xy) 对 x 求偏导要用到链式法则思想', socraticProbe: '∂f/∂x = ye^(xy) + cos(x+y)，∂f/∂y = xe^(xy) + cos(x+y)。混合偏导呢？' },
    { phase: 'summary', content: '【本节总结】\n① 偏导数 = 固定其他变量，对一个变量求导\n② 记号 ∂（round d）区别于普通导数 d\n③ Clairaut 定理：连续混合偏导与求导顺序无关\n④ 应用：梯度向量 ∇f = (∂f/∂x, ∂f/∂y) 指向最快上升方向' },
  ],
  continuity: [
    { phase: 'intro', content: '连续性是我们直觉上「不断开」的数学精确化。一个连续函数的图像是可以一笔画成的。', socraticProbe: '哪些函数是不连续的？想想分段函数或者有跳跃点的函数' },
    { phase: 'definition', content: '【连续的三要素】\n① f(x₀) 有定义（点存在）\n② lim_{x→x₀} f(x) 存在（极限存在）\n③ lim_{x→x₀} f(x) = f(x₀)（极限值 = 函数值）\n三者缺一不可！', socraticProbe: '如果只满足前两条但不满足第三条，这种间断叫什么类型？' },
    { phase: 'example', content: '【例1】f(x) = (x²-1)/(x-1) 在 x=1 处\n化简：f(x) = (x+1)(x-1)/(x-1) = x+1 (x≠1)\nf(1) 无定义 → 不满足条件① → **可去间断点**\n补充定义 f(1)=2 后即可连续\n\n【例2】sgn(x)（符号函数）在 x=0 → 左右极限不等 → **跳跃间断点**', socraticProbe: '第三类间断点是什么？提示：振荡型，比如 sin(1/x) 在 x→0 时' },
    { phase: 'practice', content: '【练习】讨论 f(x) = x·sin(1/x) (x≠0), f(0)=0 在 x=0 处的连续性\n提示：用夹逼定理判断极限是否存在', socraticProbe: '|x·sin(1/x)| ≤ |x| → 0，所以极限存在且等于 f(0)=0。这是一个连续但不可导的经典例子' },
    { phase: 'summary', content: '【本节总结】\n① 连续三要素：有定义、有极限、极限值=函数值\n② 间断点分类：可去（补定义）、跳跃（左右极限不等）、振荡（极限不存在）\n③ 连续函数的性质：介值定理、最值定理\n④ 连续 ⇒ 可导？不！连续只是可导的必要条件' },
  ],
  integration_by_parts: [
    { phase: 'intro', content: '分部积分法是积分版的「乘积法则」。当你遇到两个不同类型函数相乘的积分时，它是最有力的武器。', socraticProbe: '乘积法则是 (uv)\' = u\'v + uv\'。如果把求导换成积分，你会得到什么？' },
    { phase: 'definition', content: '【分部积分公式】∫u dv = uv - ∫v du\n由 (uv)\' = u\'v + uv\' 两边积分得到\n选 u 的原则（LIATE 法则）：\nL: 对数函数 < I: 反三角函数 < A: 代数函数 < T: 三角函数 < E: 指数函数', socraticProbe: '为什么 LIATE 这个顺序有效？想一想哪类函数求导后会简化，哪类不会' },
    { phase: 'example', content: '【例】∫x·e^x dx\n按 LIATE：A(代数 x) 排在 E(指数 e^x) 前 → u=x, dv=e^x dx\n则 du=dx, v=e^x\n∫x·e^x dx = x·e^x - ∫e^x dx = x·e^x - e^x + C = e^x(x-1) + C', socraticProbe: '如果题目是 ∫x²·e^x dx 呢？需要多次分部积分' },
    { phase: 'practice', content: '【练习】∫ln(x) dx\n这题没有明显的乘积形式，怎么办？提示：可以把 ln(x) 看作 ln(x)·1', socraticProbe: 'u=ln(x), dv=dx → du=(1/x)dx, v=x → 结果 = x·ln(x) - x + C' },
    { phase: 'summary', content: '【本节总结】\n① 分部积分 = ∫udv = uv - ∫v du（积分版乘积法则）\n② LIATE 选 u 原则：对数 > 反三角 > 代数 > 三角 > 指数\n③ 循环型：∫e^x sinx dx 需要两次分部积分后解方程\n④ 与换元法配合使用处理复杂积分' },
  ],
  taylor: [
    { phase: 'intro', content: '泰勒公式是微积分的「万能近似器」——它告诉我们任何光滑函数都可以用多项式来逼近。这是整个现代科学计算的数学基础。', socraticProbe: '为什么多项式这么好用？计算机最容易计算的是什么类型的表达式？' },
    { phase: 'definition', content: '【泰勒展开】f(x) = Σ_{n=0}^∞ [f⁽ⁿ⁾(a)/n!] (x-a)ⁿ\n= f(a) + f\'(a)(x-a) + f\'\'(a)(x-a)²/2! + f\'\'\'(a)(x-a)³/3! + ...\n麦克劳林展开（a=0）：f(x) = f(0) + f\'(0)x + f\'\'(0)x²/2! + ...', socraticProbe: 'n 越大，近似精度越高。但什么时候泰勒级数就「精确等于」原函数了？' },
    { phase: 'example', content: '【例】e^x 的麦克劳林展开\ne^x = 1 + x + x²/2! + x³/3! + x⁴/4! + ...\n因为 e^x 的任意阶导数都是 e^x，在 x=0 处都等于 1\n验证：e¹ = 1+1+1/2+1/6+1/24+... ≈ 2.71828... ✓', socraticProbe: 'sin(x) 的展开只有奇数次项，cos(x) 只有偶数次项。为什么呢？' },
    { phase: 'practice', content: '【练习】写出 ln(1+x) 在 x=0 处的前 4 项麦克劳林展开\n提示：先计算 f(0), f\'(0), f\'\'(0), f\'\'\'(0)', socraticProbe: 'ln(1+x) = x - x²/2 + x³/3 - x⁴/4 + ... 注意交错级数的特点，收敛半径是多少？' },
    { phase: 'summary', content: '【本节总结】\n① 泰勒公式 = 用多项式逼近光滑函数\n② 常见展开：e^x=Σxⁿ/n!, sinx=Σ(-1)ⁿx^{2n+1}/(2n+1)!, cosx=Σ(-1)ⁿx^{2n}/(2n)!\n③ 应用：近似计算、极限求解、方程求根\n④ 收敛半径决定了展开式的有效范围' },
  ],
};

function detectIntent(message: string): UserIntent {
  const m = message.toLowerCase().trim();

  const keywords: Partial<Record<UserIntent, string[]>> = {
    want_definition: ['定义', '什么是', '概念', '介绍一下', 'meaning', 'definition', 'explain', '解释'],
    want_example: ['例子', '怎么算', '演示', '举个例子', 'example', 'show me', '具体'],
    continue: ['继续', '下一步', '然后呢', '懂了', '明白了', 'ok', 'next', '继续说', 'go on', 'yes', '好'],
    confused: ['为什么', '怎么回事', '不理解', '不懂', '没懂', 'why', 'confused', '不明白', '不清楚', '困惑'],
    student_answer: ['答案是', '结果是', '我认为', '我觉得是', '应该是', 'my answer', '等于'],
    greeting: ['你好', 'hi', 'hello', '开始', 'start'],
  };

  if (m === '重新开始' || m === 'restart' || m === 'reset') {
    return 'continue';
  }

  let matched: UserIntent = 'unknown';
  let maxMatches = 0;

  for (const [intent, words] of Object.entries(keywords)) {
    const count = words.filter(w => m.includes(w)).length;
    if (count > maxMatches && count > 0) {
      maxMatches = count;
      matched = intent as UserIntent;
    }
  }

  if (matched === 'unknown') {
    return m.length <= 4 ? 'continue' : 'student_answer';
  }
  return matched;
}

function getDialogState(userId: string, kpId: string): DialogState {
  const key = `${userId}:${kpId}`;
  if (!dialogStates.has(key)) {
    dialogStates.set(key, {
      userId,
      knowledgePoint: kpId,
      currentPhase: 'intro',
      stepIndex: 0,
      history: [],
    });
  }
  return dialogStates.get(key)!;
}

function findStepByPhase(steps: TeachingStep[], phase: TeachingPhase): TeachingStep | undefined {
  return steps.find(s => s.phase === phase);
}

function indexOfPhase(steps: TeachingStep[], phase: TeachingPhase): number {
  return steps.findIndex(s => s.phase === phase);
}

function advanceToNextPhase(state: DialogState, steps: TeachingStep[], depth: number = 0): string {
  if (depth > PHASE_ORDER.length) {
    return '🎉 本节课程已全部学完！你可以返回诊断页面测试自己的掌握程度，或者选择其他知识点继续学习。';
  }

  const currentIdx = PHASE_ORDER.indexOf(state.currentPhase);
  const nextIdx = currentIdx + 1;

  if (nextIdx >= PHASE_ORDER.length) {
    const finalStep = findStepByPhase(steps, 'summary');
    if (finalStep) {
      return `🎉 课程内容已全部完成！\n\n${finalStep.content}\n\n如果想复习某个部分，可以说「重新开始」或选择其他知识点学习`;
    }
    return '🎉 本节课程已全部学完！你可以返回诊断页面测试自己的掌握程度，或者选择其他知识点继续学习。';
  }

  const nextPhase = PHASE_ORDER[nextIdx];
  state.currentPhase = nextPhase;
  state.stepIndex = indexOfPhase(steps, nextPhase);

  const step = findStepByPhase(steps, nextPhase);
  if (!step) return advanceToNextPhase(state, steps, depth + 1);

  let response = '';
  if (PHASE_LABELS[nextPhase]) {
    response += `${PHASE_LABELS[nextPhase]} → \n\n`;
  }
  response += step.content;
  if (step.socraticProbe) {
    response += `\n\n🤔 ${step.socraticProbe}`;
  }
  return response;
}

export async function sendTeachingMessage(
  message: string,
  knowledgePointId: string,
  _history: TeachingMessage[]
): Promise<TeachingMessage> {
  updateAgentState('tutor', 'running');

  await new Promise(r => setTimeout(r, 800));

  const trimmedMessage = message.trim();
  if (trimmedMessage.length > 2000) {
    updateAgentState('tutor', 'completed');
    return {
      id: `msg_${Date.now()}`,
      role: 'tutor',
      content: '消息过长，请缩短后重试（最多2000字符）。',
      timestamp: Date.now(),
      type: 'text',
    };
  }

  const intent = detectIntent(trimmedMessage);

  if (trimmedMessage.toLowerCase() === '重新开始' || trimmedMessage.toLowerCase() === 'restart' || trimmedMessage.toLowerCase() === 'reset') {
    const key = `local_user:${knowledgePointId}`;
    dialogStates.delete(key);
    cleanupDialogStates();
  }

  const state = getDialogState('local_user', knowledgePointId);
  const steps = TEACHING_CONTENT[knowledgePointId] || getDefaultSteps();
  state.history.push(trimmedMessage);
  if (state.history.length > MAX_HISTORY_SIZE) {
    state.history = state.history.slice(-MAX_HISTORY_SIZE);
  }

  let response: string;

  if (trimmedMessage.toLowerCase() === '重新开始' || trimmedMessage.toLowerCase() === 'restart' || trimmedMessage.toLowerCase() === 'reset') {
    const firstStep = steps[0];
    response = `好的，让我们重新开始学习「${KNOWLEDGE_NAMES[knowledgePointId] || knowledgePointId}」！\n\n${firstStep?.content || ''}`;
    if (firstStep?.socraticProbe) {
      response += `\n\n🤔 ${firstStep.socraticProbe}`;
    }
  } else {
    switch (intent) {
      case 'confused':
        response = handleConfused(state, steps);
        break;
      case 'want_definition': {
        const defStep = findStepByPhase(steps, 'definition');
        if (defStep) {
          state.currentPhase = 'definition';
          state.stepIndex = indexOfPhase(steps, 'definition');
          response = `好的，这里是正式定义：\n\n${defStep.content}\n\n🤔 ${defStep.socraticProbe || ''}`;
        } else {
          response = advanceToNextPhase(state, steps);
        }
        break;
      }
      case 'want_example': {
        const exStep = findStepByPhase(steps, 'example');
        if (exStep) {
          state.currentPhase = 'example';
          state.stepIndex = indexOfPhase(steps, 'example');
          response = `来看一个具体的例子：\n\n${exStep.content}\n\n💡 ${exStep.socraticProbe || ''}`;
        } else {
          response = advanceToNextPhase(state, steps);
        }
        break;
      }
      case 'continue':
        response = advanceToNextPhase(state, steps);
        break;
      case 'student_answer':
        if (state.currentPhase === 'practice') {
          const currentStep = steps[state.stepIndex];
          if (!currentStep) {
            response = advanceToNextPhase(state, steps);
          } else {
            const isPositive = /对|正确|是|yes|=|答案/.test(message.toLowerCase());
            response = isPositive
              ? `✅ 很好！看来你已经掌握了这个要点。\n\n${currentStep?.socraticProbe || ''}\n\n输入「继续」进入下一个教学环节`
              : `🤔 思路方向值得肯定，但可能还需要调整。\n\n让我给你一些引导：${currentStep?.socraticProbe || ''}`;
          }
        } else {
          const currentStep = steps[state.stepIndex];
          response = currentStep
            ? `收到你的想法！${currentStep.socraticProbe || ''}\n\n输入「继续」进入下一环节，或输入「例子」看更多例题`
            : advanceToNextPhase(state, steps);
        }
        break;
      case 'greeting':
        response = `你好！我是你的AI数学导师 🎓 今天我们一起来学习「${KNOWLEDGE_NAMES[knowledgePointId] || knowledgePointId}」。准备好了吗？输入「开始」或「继续」即可！`;
        break;
      default:
        response = advanceToNextPhase(state, steps);
    }
  }

  cleanupDialogStates();

  const tutorMessage: TeachingMessage = {
    id: `msg_${Date.now()}`,
    role: 'tutor',
    content: response,
    timestamp: Date.now(),
    type: 'text',
    metadata: {
      knowledgePoint: knowledgePointId,
      phase: state.currentPhase,
      intent,
      isSocratic: response.includes('？') || response.includes('?'),
    },
  };

  emitAgentMessage({
    id: tutorMessage.id,
    agent: 'tutor',
    content: response,
    timestamp: tutorMessage.timestamp,
    metadata: { knowledgePoint: knowledgePointId, action: 'teach', phase: state.currentPhase },
  });

  updateAgentState('tutor', 'completed');
  return tutorMessage;
}

function handleConfused(state: DialogState, steps: TeachingStep[]): string {
  const currentStep = steps[state.stepIndex];
  if (!currentStep) return advanceToNextPhase(state, steps);

  switch (state.currentPhase) {
    case 'intro':
      return `没关系，我们从头来。\n\n${currentStep.content}\n\n💡 ${currentStep.socraticProbe || ''}`;
    case 'definition':
      return `定义确实比较抽象，让我换个方式解释：\n\n关键就一句话：${extractCoreIdea(currentStep.content)}\n\n${currentStep.socraticProbe || ''}`;
    case 'example':
      return `这个例子的思路确实需要仔细理解。\n\n哪一步不太清楚？可以告诉我具体哪里需要更多解释`;
    case 'practice':
      return `练习有难度很正常！给个提示：\n\n回顾一下本节的核心公式和例题方法，思路会清晰很多\n\n再试一次？`;
    case 'summary':
      return `总结部分我帮你梳理一下重点：\n\n${summarizeKeyPoints(currentStep.content)}\n\n还有哪里想深入讨论的吗？`;
    default:
      return `${currentStep.content}\n\n${currentStep.socraticProbe || ''}`;
  }
}

function extractCoreIdea(content: string): string {
  if (content.includes('极限')) return '极限描述的是一种「趋势」——当自变量无限接近某值时，函数值的走向';
  if (content.includes('导数')) return '导数就是瞬时变化率 = 切线斜率';
  if (content.includes('积分')) return '积分是求和的极限，定积分算面积/体积';
  return '抓住核心思想：理解「为什么」比记住公式更重要';
}

function summarizeKeyPoints(content: string): string {
  const lines = content.split('\n');
  return lines
    .filter(l => /^[①②③④]/.test(l.trim()))
    .join('\n');
}

function getDefaultSteps(): TeachingStep[] {
  return [
    { phase: 'intro', content: '欢迎来到本节课程！让我们一步步深入理解这个知识点。', socraticProbe: '你对这个话题有多少了解？我们可以从你最熟悉的部分开始' },
    { phase: 'definition', content: '这里是该知识点的正式定义和核心概念...', socraticProbe: '你能用自己的话复述一下这个定义的关键部分吗？' },
    { phase: 'example', content: '下面我们通过具体例子来理解...', socraticProbe: '这个例子的解题思路是什么？关键步骤在哪里？' },
    { phase: 'practice', content: '现在轮到你来尝试了...', socraticProbe: '你的思路是什么？大胆说出来，我们一起探讨' },
    { phase: 'summary', content: '本节课我们学习了...', socraticProbe: '你觉得最难理解的部分是什么？我们可以在下次课重点复习' },
  ];
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

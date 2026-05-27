export interface MockMessage {
  role: 'system' | 'diagnoser' | 'planner' | 'tutor' | 'student';
  content: string;
  delay: number;
  meta?: {
    tool?: string;
    confidence?: number;
    weakNodeId?: string;
    phase?: string;
    strategy?: string;
  };
}

export interface MockDiagnosisFlow {
  id: string;
  topic: string;
  steps: MockMessage[];
  branchSteps?: Record<string, MockMessage[]>;
}

export const DIAGNOSIS_FLOWS: MockDiagnosisFlow[] = [
  {
    id: 'quadratic_function',
    topic: '二次函数',
    steps: [
      {
        role: 'system',
        content: '认知诊断引擎启动 — 知识图谱加载完成（15个概念节点，12条错误模式）',
        delay: 400,
        meta: { tool: 'knowledge_graph', confidence: 1.0 },
      },
      {
        role: 'diagnoser',
        content: '正在分析学生在「二次函数」上的认知状态...\n\n🔍 知识图谱路径扫描：\n  一元二次方程 → 二次函数图像 → 顶点式与一般式\n\n⚠️ 检测到潜在薄弱节点：顶点式与一般式转换（常见错误率 35%）',
        delay: 1200,
        meta: { tool: 'cognitive_diagnoser', confidence: 0.85, weakNodeId: 'vertex_form_conversion' },
      },
      {
        role: 'planner',
        content: '📋 学习路径规划完成：\n\n① 复习一元二次方程求根（预计8分钟）\n② 理解顶点式 y=a(x-h)²+k 的几何含义（预计12分钟）\n③ 练习：一般式 ↔ 顶点式互化（预计10分钟）\n④ 应用题：抛物线与实际问题（预计15分钟）\n\n💡 策略选择：脚手架引导（Scaffold）— 学生当前掌握度 0.32，适合逐步搭建理解框架',
        delay: 1800,
        meta: { tool: 'learning_planner', confidence: 0.78, phase: 'planning', strategy: 'scaffold' },
      },
      {
        role: 'tutor',
        content: '同学你好！我们来攻克「二次函数」这个知识点 🎯\n\n先确认一下基础：你知道一元二次方程 ax²+bx+c=0 的求根公式吗？\n\nx = (-b ± √(b²-4ac)) / 2a\n\n这个公式是理解二次函数图像的起点——函数图像与x轴的交点，就是方程的根！\n\n🤔 你能说出判别式 Δ=b²-4ac 的三种情况分别对应什么样的图像吗？',
        delay: 2200,
        meta: { tool: 'socratic_tutor', confidence: 0.9, phase: 'intro', strategy: 'scaffold' },
      },
      {
        role: 'tutor',
        content: '很好！现在让我们从一般式 y=ax²+bx+c 出发，理解顶点式 y=a(x-h)²+k：\n\n【配方法】\ny = ax²+bx+c\n  = a(x² + (b/a)x) + c\n  = a(x + b/2a)² - b²/4a + c\n  = a(x + b/2a)² + (4ac-b²)/4a\n\n所以顶点坐标为 (-b/2a, (4ac-b²)/4a)\n\n🔑 关键洞察：配方法本质上是在「完成平方」，把一般式「翻译」成顶点式\n\n🤔 如果 a=1, b=-4, c=3，你能写出顶点式并画出大致图像吗？',
        delay: 2500,
        meta: { tool: 'socratic_tutor', confidence: 0.88, phase: 'definition', weakNodeId: 'vertex_form_conversion', strategy: 'scaffold' },
      },
      {
        role: 'tutor',
        content: '✅ 诊断结果更新：\n\n经过3轮交互，你的认知状态：\n  • 一元二次方程：掌握度 0.72 ✅\n  • 二次函数图像：掌握度 0.55 📈\n  • 顶点式转换：掌握度 0.38 ⚠️\n\n推荐下一步：完成3道顶点式转换练习题，将掌握度提升至0.6以上\n\n💡 自反思引擎记录：当前「脚手架引导」策略对该学生有效（奖励值 +2.3），继续维持该策略',
        delay: 2000,
        meta: { tool: 'cognitive_diagnoser', confidence: 0.82, phase: 'summary', strategy: 'scaffold' },
      },
    ],
    branchSteps: {
      how_to: [
        {
          role: 'tutor',
          content: '📝 推荐训练题：\n\n【题1】将 y=2x²-8x+5 化为顶点式，并写出顶点坐标\n  提示：提取公因子2，再配方\n\n【题2】已知抛物线顶点为(2, -3)，过点(0, 5)，求解析式\n  提示：设顶点式 y=a(x-2)²-3，代入(0,5)求a\n\n【题3】抛物线 y=x²-4x+3 与x轴交于A、B两点，与y轴交于C点，求△ABC面积\n  提示：先求三个交点坐标\n\n每题完成后告诉我你的答案，我来帮你检查！',
          delay: 1500,
          meta: { tool: 'exercise_generator', confidence: 0.75, phase: 'practice', strategy: 'scaffold' },
        },
      ],
    },
  },
  {
    id: 'derivative',
    topic: '导数',
    steps: [
      {
        role: 'system',
        content: '认知诊断引擎启动 — 知识图谱加载完成（15个概念节点，12条错误模式）',
        delay: 400,
        meta: { tool: 'knowledge_graph', confidence: 1.0 },
      },
      {
        role: 'diagnoser',
        content: '正在分析学生在「导数」上的认知状态...\n\n🔍 知识图谱路径扫描：\n  极限 → 导数定义 → 求导法则 → 链式法则\n\n⚠️ 检测到潜在薄弱节点：链式法则（常见错误率 42%）\n📊 前置知识检查：极限概念掌握度 0.68（基本达标）',
        delay: 1400,
        meta: { tool: 'cognitive_diagnoser', confidence: 0.82, weakNodeId: 'chain_rule' },
      },
      {
        role: 'planner',
        content: '📋 学习路径规划完成：\n\n① 巩固导数定义（差商极限）（预计10分钟）\n② 基本求导公式速查（预计8分钟）\n③ 乘积法则与链式法则（预计15分钟）\n④ 综合练习（预计12分钟）\n\n💡 策略选择：例题演示（Worked Example）— 链式法则需要通过具体例子建立直觉',
        delay: 1600,
        meta: { tool: 'learning_planner', confidence: 0.8, phase: 'planning', strategy: 'worked_example' },
      },
      {
        role: 'tutor',
        content: '同学你好！今天我们来理解「导数」——微积分最核心的概念 📐\n\n导数的本质就是「瞬时变化率」。想象你在开车：\n  • 平均速度 = 总路程 / 总时间\n  • 瞬时速度 = 某一时刻的速度表读数\n\n数学表达：f\'(x₀) = lim_{h→0} [f(x₀+h) - f(x₀)] / h\n\n🤔 为什么 h 要「趋近0」而不是「等于0」？如果 h=0 会发生什么？',
        delay: 2200,
        meta: { tool: 'socratic_tutor', confidence: 0.92, phase: 'intro', strategy: 'worked_example' },
      },
      {
        role: 'tutor',
        content: '【链式法则详解】\n\n核心公式：(f(g(x)))\' = f\'(g(x)) · g\'(x)\n\n口诀：「外层导 × 内层导」，像剥洋葱 🧅\n\n【例】求 y = sin(x²) 的导数\n  步骤1：识别结构 — 外层 sin(·)，内层 x²\n  步骤2：外层导 — cos(x²)\n  步骤3：内层导 — 2x\n  结果：y\' = cos(x²) · 2x = 2x·cos(x²) ✅\n\n🤔 那如果是 y = e^{sin(x)} 呢？试着用同样的方法分解！',
        delay: 2400,
        meta: { tool: 'socratic_tutor', confidence: 0.87, phase: 'example', weakNodeId: 'chain_rule', strategy: 'worked_example' },
      },
      {
        role: 'tutor',
        content: '✅ 诊断结果更新：\n\n经过3轮交互，你的认知状态：\n  • 导数定义：掌握度 0.78 ✅\n  • 基本求导：掌握度 0.65 📈\n  • 链式法则：掌握度 0.45 ⚠️（较初始提升0.13）\n\n推荐下一步：完成链式法则专项练习5题\n\n💡 自反思引擎记录：「例题演示」策略效果良好（奖励值 +1.8），但链式法则仍需更多练习巩固',
        delay: 1800,
        meta: { tool: 'cognitive_diagnoser', confidence: 0.79, phase: 'summary', strategy: 'worked_example' },
      },
    ],
    branchSteps: {
      how_to: [
        {
          role: 'tutor',
          content: '📝 链式法则专项训练题：\n\n【题1】求 d/dx[ln(x²+1)]\n  提示：外层 ln(·)，内层 x²+1\n\n【题2】求 d/dx[(3x-1)⁵]\n  提示：外层 (·)⁵，内层 3x-1\n\n【题3】求 d/dx[sin²(x)]\n  提示：这可以看作 [sin(x)]²，外层 (·)²，内层 sin(x)\n\n做完后告诉我答案，我来帮你验证！',
          delay: 1500,
          meta: { tool: 'exercise_generator', confidence: 0.72, phase: 'practice', strategy: 'worked_example' },
        },
      ],
    },
  },
  {
    id: 'integral',
    topic: '不定积分',
    steps: [
      {
        role: 'system',
        content: '认知诊断引擎启动 — 知识图谱加载完成（15个概念节点，12条错误模式）',
        delay: 400,
        meta: { tool: 'knowledge_graph', confidence: 1.0 },
      },
      {
        role: 'diagnoser',
        content: '正在分析学生在「不定积分」上的认知状态...\n\n🔍 知识图谱路径扫描：\n  导数 → 逆运算 → 不定积分 → 换元积分\n\n⚠️ 检测到潜在薄弱节点：换元积分法（常见错误率 48%）\n📊 前置知识检查：导数掌握度 0.75（达标），基本积分公式掌握度 0.52（需巩固）',
        delay: 1300,
        meta: { tool: 'cognitive_diagnoser', confidence: 0.83, weakNodeId: 'substitution_method' },
      },
      {
        role: 'planner',
        content: '📋 学习路径规划完成：\n\n① 基本积分公式回顾（预计10分钟）\n② 直接积分法练习（预计8分钟）\n③ 第一换元法（凑微分）（预计15分钟）\n④ 综合应用（预计12分钟）\n\n💡 策略选择：类比推理（Analogy）— 积分是导数的「逆运算」，用已知推导未知',
        delay: 1700,
        meta: { tool: 'learning_planner', confidence: 0.76, phase: 'planning', strategy: 'analogy' },
      },
      {
        role: 'tutor',
        content: '同学你好！积分是导数的「时光倒流」⏪\n\n类比理解：\n  • 导数：拆解变化 → 知道速度，问「变化率是多少？」\n  • 积分：累积总量 → 知道速度，问「总共走了多远？」\n\n核心定义：若 F\'(x) = f(x)，则 ∫f(x)dx = F(x) + C\n\n🔑 为什么有 +C？因为 (x³+C)\' = 3x²，C 是任何常数导数都是0！\n\n🤔 你能说出 ∫3x²dx 的结果吗？提示：想想什么函数求导等于3x²',
        delay: 2000,
        meta: { tool: 'socratic_tutor', confidence: 0.91, phase: 'intro', strategy: 'analogy' },
      },
      {
        role: 'tutor',
        content: '【凑微分法（第一换元法）】\n\n核心思想：把被积函数「凑」成 f(g(x))·g\'(x) 的形式\n\n【例】求 ∫2x·e^{x²}dx\n  观察：2x 恰好是 x² 的导数！\n  设 u = x²，则 du = 2x dx\n  原式 = ∫e^u du = e^u + C = e^{x²} + C ✅\n\n🔑 凑微分的关键：找到被积函数中「谁是谁的导数」\n\n🤔 试试 ∫cos(x)·e^{sin(x)}dx，你能看出该设 u 为什么吗？',
        delay: 2300,
        meta: { tool: 'socratic_tutor', confidence: 0.85, phase: 'example', weakNodeId: 'substitution_method', strategy: 'analogy' },
      },
      {
        role: 'tutor',
        content: '✅ 诊断结果更新：\n\n经过3轮交互，你的认知状态：\n  • 基本积分公式：掌握度 0.68 📈\n  • 直接积分法：掌握度 0.62 📈\n  • 换元积分法：掌握度 0.40 ⚠️（较初始提升0.12）\n\n推荐下一步：完成5道凑微分练习题\n\n💡 自反思引擎记录：「类比推理」策略帮助学生建立了积分直觉（奖励值 +2.1），换元法需更多例题巩固',
        delay: 1900,
        meta: { tool: 'cognitive_diagnoser', confidence: 0.8, phase: 'summary', strategy: 'analogy' },
      },
    ],
    branchSteps: {
      how_to: [
        {
          role: 'tutor',
          content: '📝 换元积分法训练题：\n\n【题1】∫x·sin(x²)dx\n  提示：设 u=x²\n\n【题2】∫(2x+1)³dx\n  提示：设 u=2x+1，注意 du=2dx\n\n【题3】∫e^x/(1+e^x)dx\n  提示：设 u=1+e^x\n\n完成后告诉我答案，我来验证！',
          delay: 1500,
          meta: { tool: 'exercise_generator', confidence: 0.7, phase: 'practice', strategy: 'analogy' },
        },
      ],
    },
  },
];

export function getFlowByTopic(topic: string): MockDiagnosisFlow | undefined {
  return DIAGNOSIS_FLOWS.find(f => f.topic === topic || f.id === topic);
}

export function getAllTopics(): string[] {
  return DIAGNOSIS_FLOWS.map(f => f.topic);
}

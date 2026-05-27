export interface MCPTool {
  name: string;
  description: string;
  icon: string;
  status: 'online' | 'local_only';
  category: string;
  exampleCall?: string;
}

export const MOCK_MCP_TOOLS: MCPTool[] = [
  {
    name: 'math_calculator',
    description: '数学表达式计算与方程求解，支持分步过程展示',
    icon: '🧮',
    status: 'online',
    category: '数学',
    exampleCall: 'calculate("x^2 + 5x + 6 = 0") → (x+2)(x+3)=0',
  },
  {
    name: 'code_executor',
    description: 'Python代码沙箱执行，支持numpy/matplotlib',
    icon: '💻',
    status: 'local_only',
    category: '编程',
    exampleCall: 'execute_python("import numpy; print(numpy.pi)")',
  },
  {
    name: 'visualization',
    description: '函数图像绘制与LaTeX公式渲染',
    icon: '📊',
    status: 'local_only',
    category: '可视化',
    exampleCall: 'plot_function("sin(x)", "x", [-6.28, 6.28])',
  },
  {
    name: 'paper_search',
    description: 'ArXiv论文检索与摘要提取',
    icon: '📄',
    status: 'online',
    category: '研究',
    exampleCall: 'search_papers("transformer attention mechanism")',
  },
  {
    name: 'knowledge_graph',
    description: '知识图谱查询：概念关系、前置依赖、错误模式',
    icon: '🕸️',
    status: 'online',
    category: '知识',
    exampleCall: 'query_prerequisites("链式法则")',
  },
  {
    name: 'file_system',
    description: '本地文件读写（仅限沙箱目录）',
    icon: '📁',
    status: 'local_only',
    category: '系统',
    exampleCall: 'read_file("/workspace/notes.md")',
  },
  {
    name: 'leetcode_api',
    description: 'LeetCode题目检索与提交验证',
    icon: '🏆',
    status: 'local_only',
    category: '编程',
    exampleCall: 'get_problem("two-sum")',
  },
  {
    name: 'python_executor',
    description: '交互式Python REPL，支持pip安装',
    icon: '🐍',
    status: 'local_only',
    category: '编程',
    exampleCall: 'run_cell("import sympy; sympy.diff(sympy.sin(x))")',
  },
];

export function getOnlineTools(): MCPTool[] {
  return MOCK_MCP_TOOLS.filter(t => t.status === 'online');
}

export function getLocalOnlyTools(): MCPTool[] {
  return MOCK_MCP_TOOLS.filter(t => t.status === 'local_only');
}

export function getToolCategories(): string[] {
  return [...new Set(MOCK_MCP_TOOLS.map(t => t.category))];
}

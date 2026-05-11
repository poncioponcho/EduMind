import { FunctionPlotViewer, InlinePlotViewer } from '../components/FunctionPlotViewer';

export interface PlotResult {
  success: boolean;
  image_base64?: string;
  image_url?: string;
  metadata?: {
    function: string;
    title: string;
    x_range: [number, number];
    has_special_points?: boolean;
    discontinuity_type?: string;
  };
}

// 从MCP工具响应中提取图像数据
export function extractPlotDataFromResponse(response: string): PlotResult | null {
  try {
    // 尝试解析JSON响应
    const jsonMatch = response.match(/\{[\s\S]*"success"\s*:\s*true[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]) as PlotResult;
      if (data.success && (data.image_base64 || data.image_url)) {
        return data;
      }
    }

    // 检查是否包含Base64图像数据
    const base64Match = response.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/);
    if (base64Match) {
      return {
        success: true,
        image_base64: base64Match[0].replace('data:image/png;base64,', ''),
        metadata: { function: 'unknown', title: '函数图像', x_range: [-10, 10] }
      };
    }

    // 检查是否包含图像URL
    const urlMatch = response.match(/assets\/plots\/[^"'\s)]+\.png/);
    if (urlMatch) {
      return {
        success: true,
        image_url: urlMatch[0],
        metadata: { function: 'unknown', title: '函数图像', x_range: [-10, 10] }
      };
    }

    return null;
  } catch (e) {
    console.error('Failed to extract plot data:', e);
    return null;
  }
}

// 检测消息是否包含绘图请求
export function isPlotRequest(message: string): boolean {
  const plotKeywords = [
    '画', '绘制', 'plot', 'graph', '图像', '图形',
    '函数图像', '函数图', '画图', 'show me', 'visualize'
  ];
  
  const lowerMsg = message.toLowerCase();
  return plotKeywords.some(keyword => lowerMsg.includes(keyword.toLowerCase()));
}

// 检测消息是否包含函数表达式
export function extractFunctionExpression(message: string): string | null {
  // 常见数学函数模式
  const patterns = [
    /f\s*\(\s*x\s*\)\s*=\s*([^,，。！？\n]+)/i,
    /y\s*=\s*([^,，。！？\n]+)/,
    /(sin|cos|tan|log|ln|sqrt|exp)\s*\([^)]+\)/gi,
    /x\^?\d*\s*[+\-*/]\s*x/,
    /\d+\s*\*\s*x\s*\^?\d*/
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

// 预设的间断点示例配置
export const DISCONTINUITY_EXAMPLES = {
  continuous: {
    function: 'sin(x)',
    xRange: '-6.28,6.28',
    title: '连续函数示例：f(x) = sin(x)',
    description: '正弦函数在整个定义域上连续'
  },
  removable: {
    function: 'x**2',
    piecewiseDef: JSON.stringify([
      { expr: 'x**2', cond: 'x!=2', color: '#4F46E5' },
      { expr: '1', cond: 'x==2', color: '#EF4444' }
    ]),
    specialPoints: JSON.stringify([
      { x: 2, y: 4, type: 'open' as const, label: '极限值(2,4)' },
      { x: 2, y: 1, type: 'filled' as const, label: 'f(2)=1' }
    ]),
    discontinuityInfo: 'removable,x=2,lim=4,val=1',
    xRange: '-3,3',
    yRange: '-0.5,5',
    title: '可去间断点示例',
    description: '在x=2处存在可去间断点'
  },
  jump: {
    function: '(x > 0).astype(float) * 1 + (x <= 0).astype(float) * (-1)',
    xRange: '-3,3',
    title: '跳跃间断点示例：sgn(x)',
    description: '符号函数在x=0处有跳跃间断点'
  },
  infinite: {
    function: '1/x',
    xRange: '-5,5',
    yRange: '-10,10',
    title: '无穷间断点示例：f(x) = 1/x',
    description: '在x=0处有无穷间断点（垂直渐近线）'
  }
};

// 为前端生成绘图请求参数
export function generatePlotParams(
  type: keyof typeof DISCONTINUITY_EXAMPLES,
  customFunction?: string
): Record<string, string> {
  const config = DISCONTINUITY_EXAMPLES[type];
  
  return {
    function: customFunction || config.function,
    x_range: config.xRange,
    y_range: config.yRange || '',
    title: config.title,
    special_points: config.specialPoints || '',
    discontinuity_info: config.discontinuityInfo || '',
    piecewise_def: config.piecewiseDef || ''
  };
}

// 导出组件供其他模块使用
export { FunctionPlotViewer, InlinePlotViewer };

export default {
  extractPlotDataFromResponse,
  isPlotRequest,
  extractFunctionExpression,
  generatePlotParams,
  DISCONTINUITY_EXAMPLES,
  FunctionPlotViewer,
  InlinePlotViewer
};

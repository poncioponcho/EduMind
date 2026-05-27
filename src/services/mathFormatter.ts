const LATEX_COMMANDS = [
  'frac', 'sqrt', 'int', 'sum', 'prod', 'lim', 'sin', 'cos', 'tan',
  'log', 'ln', 'exp', 'min', 'max', 'inf', 'sup', 'det', 'dim',
  'arg', 'deg', 'gcd', 'hom', 'ker', 'Pr', 'sec', 'csc', 'cot',
  'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan',
  'left', 'right', 'Big', 'bigg', 'big', 'Bigg',
  'mathbb', 'mathbf', 'mathcal', 'mathfrak', 'mathrm', 'mathit',
  'vec', 'hat', 'bar', 'dot', 'ddot', 'tilde', 'overline', 'underline',
  'overrightarrow', 'overleftarrow',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma',
  'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
  'infty', 'partial', 'nabla', 'forall', 'exists', 'emptyset',
  'cdot', 'times', 'div', 'pm', 'mp', 'leq', 'geq', 'neq', 'approx',
  'equiv', 'sim', 'simeq', 'cong', 'propto', 'll', 'gg',
  'subset', 'supset', 'subseteq', 'supseteq', 'in', 'notin', 'ni',
  'cup', 'cap', 'setminus', 'vee', 'wedge', 'oplus', 'otimes',
  'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow', 'leftrightarrow',
  'mapsto', 'hookrightarrow', 'uparrow', 'downarrow',
  'quad', 'qquad',
  'begin', 'end', 'text', 'mathrm', 'textbf', 'textit',
  'displaystyle', 'textstyle', 'dfrac', 'tfrac',
  'overline', 'underline', 'overbrace', 'underbrace',
  'xrightarrow', 'xleftarrow',
];

const LATEX_ENVIRONMENTS = [
  'equation', 'align', 'aligned', 'gather', 'gathered',
  'cases', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix',
  'array', 'tabular', 'itemize', 'enumerate',
];

const BARE_LATEX_PATTERN = new RegExp(
  '\\\\(?:' + LATEX_COMMANDS.join('|') + ')\\b',
);

const LATEX_ENV_PATTERN = new RegExp(
  '\\\\begin\\{(?:' + LATEX_ENVIRONMENTS.join('|') + ')\\}',
);

function containsBareLatex(text: string): boolean {
  return BARE_LATEX_PATTERN.test(text) || LATEX_ENV_PATTERN.test(text);
}

function findLatexExtent(text: string, startIdx: number): number {
  let depth = 0;
  let i = startIdx;
  let lastContentIdx = startIdx;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '{') {
      depth++;
      lastContentIdx = i;
    } else if (ch === '}') {
      depth--;
      lastContentIdx = i;
      if (depth <= 0) {
        return i + 1;
      }
    } else if (ch === '\\' && i + 1 < text.length) {
      lastContentIdx = i;
      const nextCh = text[i + 1];
      if (nextCh === '[' || nextCh === '(') {
        depth++;
        i += 2;
        continue;
      }
      if (nextCh === ']' || nextCh === ')') {
        depth--;
        i += 2;
        continue;
      }
      i += 2;
      continue;
    } else if (ch === '_' || ch === '^') {
      lastContentIdx = i;
      if (i + 1 < text.length && text[i + 1] === '{') {
        i += 2;
        depth++;
        continue;
      }
    } else if (ch === '\n' && depth <= 0) {
      const nextLine = text.substring(i + 1).trimStart();
      if (nextLine.startsWith('\\') || nextLine.startsWith('$') || nextLine === '') {
        break;
      }
    }

    i++;
  }

  return Math.max(lastContentIdx + 1, startIdx + 1);
}

export function autoWrapMath(text: string): string {
  if (!text) return text;

  let result = text;

  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (match) => match);
  result = result.replace(/\$([^\$]+?)\$/g, (match) => match);

  const lines = result.split('\n');
  const processedLines: string[] = [];

  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];

    if (line.trim().startsWith('$$') || line.trim().startsWith('$')) {
      processedLines.push(line);
      continue;
    }

    if (/^\s*[-*•]\s/.test(line) || /^\s*\d+[.)]\s/.test(line)) {
      const prefix = line.match(/^(\s*[-*•]\s|\s*\d+[.)]\s)/)?.[1] || '';
      const content = line.substring(prefix.length);
      if (containsBareLatex(content)) {
        processedLines.push(prefix + wrapLatexInLine(content));
      } else {
        processedLines.push(line);
      }
      continue;
    }

    if (containsBareLatex(line)) {
      processedLines.push(wrapLatexInLine(line));
    } else {
      processedLines.push(line);
    }
  }

  return processedLines.join('\n');
}

function wrapLatexInLine(line: string): string {
  let result = '';
  let remaining = line;

  while (remaining.length > 0) {
    const match = remaining.match(BARE_LATEX_PATTERN) || remaining.match(LATEX_ENV_PATTERN);

    if (!match || match.index === undefined) {
      result += remaining;
      break;
    }

    if (match.index > 0) {
      const before = remaining.substring(0, match.index);
      result += before;
    }

    const startIdx = match.index;
    const endIdx = findLatexExtent(remaining, startIdx);

    let latexBlock = remaining.substring(startIdx, endIdx);

    let scanBack = result.length - 1;
    while (scanBack >= 0 && result[scanBack] === ' ') scanBack--;
    if (scanBack >= 0 && result[scanBack] === '=') {
      while (scanBack >= 0 && (result[scanBack] === '=' || result[scanBack] === ' ')) {
        latexBlock = result[scanBack] + latexBlock;
        scanBack--;
      }
      result = result.substring(0, scanBack + 1);
    }

    let scanFwd = endIdx;
    while (scanFwd < remaining.length && remaining[scanFwd] === ' ') scanFwd++;
    if (scanFwd < remaining.length && (remaining[scanFwd] === '=' || remaining[scanFwd] === '+' || remaining[scanFwd] === '-')) {
      while (scanFwd < remaining.length && (remaining[scanFwd] === '=' || remaining[scanFwd] === ' ' || remaining[scanFwd] === '+' || remaining[scanFwd] === '-')) {
        latexBlock += remaining[scanFwd];
        scanFwd++;
      }
      remaining = remaining.substring(scanFwd);
    } else {
      remaining = remaining.substring(endIdx);
    }

    if (latexBlock.includes('\n') || latexBlock.includes('\\begin{') || latexBlock.length > 40) {
      result += `$$${latexBlock}$$`;
    } else {
      result += `$${latexBlock}$`;
    }
  }

  return result;
}

export function formatQuestionContent(content: string): string {
  if (!content) return content;

  let result = content;

  const doubleEscaped: Record<string, string> = {
    '\\\\frac': '\\frac',
    '\\\\int': '\\int',
    '\\\\lim': '\\lim',
    '\\\\sum': '\\sum',
    '\\\\sqrt': '\\sqrt',
    '\\\\sin': '\\sin',
    '\\\\cos': '\\cos',
    '\\\\tan': '\\tan',
    '\\\\ln': '\\ln',
    '\\\\log': '\\log',
    '\\\\exp': '\\exp',
    '\\\\pi': '\\pi',
    '\\\\alpha': '\\alpha',
    '\\\\beta': '\\beta',
    '\\\\gamma': '\\gamma',
    '\\\\delta': '\\delta',
    '\\\\theta': '\\theta',
    '\\\\to': '\\to',
    '\\\\infty': '\\infty',
    '\\\\cdot': '\\cdot',
    '\\\\left': '\\left',
    '\\\\right': '\\right',
    '\\\\displaystyle': '\\displaystyle',
    '\\\\text': '\\text',
    '\\\\mathrm': '\\mathrm',
    '\\\\begin': '\\begin',
    '\\\\end': '\\end',
    '\\\\quad': '\\quad',
    '\\\\partial': '\\partial',
    '\\\\nabla': '\\nabla',
    '\\\\leq': '\\leq',
    '\\\\geq': '\\geq',
    '\\\\neq': '\\neq',
    '\\\\approx': '\\approx',
    '\\\\equiv': '\\equiv',
    '\\\\forall': '\\forall',
    '\\\\exists': '\\exists',
    '\\\\emptyset': '\\emptyset',
    '\\\\rightarrow': '\\rightarrow',
    '\\\\leftarrow': '\\leftarrow',
    '\\\\Rightarrow': '\\Rightarrow',
    '\\\\Leftarrow': '\\Leftarrow',
    '\\\\mapsto': '\\mapsto',
    '\\\\overline': '\\overline',
    '\\\\underline': '\\underline',
    '\\\\hat': '\\hat',
    '\\\\bar': '\\bar',
    '\\\\vec': '\\vec',
    '\\\\dot': '\\dot',
    '\\\\tilde': '\\tilde',
    '\\\\mathbb': '\\mathbb',
    '\\\\mathbf': '\\mathbf',
    '\\\\mathcal': '\\mathcal',
    '\\\\overrightarrow': '\\overrightarrow',
  };

  for (const [from, to] of Object.entries(doubleEscaped)) {
    result = result.replace(new RegExp(from.replace(/\\\\/g, '\\\\\\\\'), 'g'), to);
  }

  return result;
}

export function normalizeLatexForComparison(input: string): string {
  let result = input.trim();

  result = result.replace(/^答案是[:：]\s*/i, '');
  result = result.replace(/^解[:：]\s*/i, '');
  result = result.replace(/^答[:：]\s*/i, '');
  result = result.replace(/^answer[:：]\s*/i, '');

  result = result.replace(/\\/g, '');
  result = result.replace(/\$/g, '');
  result = result.replace(/\{/g, '(');
  result = result.replace(/\}/g, ')');
  result = result.replace(/frac\(([^)]+)\)\(([^)]+)\)/g, '($1)/($2)');
  result = result.replace(/\*\*/g, '^');
  result = result.replace(/×/g, '*');
  result = result.replace(/÷/g, '/');
  result = result.replace(/π/g, 'pi');
  result = result.replace(/∞/g, 'oo');
  result = result.replace(/∫/g, 'int');
  result = result.replace(/→/g, '->');
  result = result.replace(/·/g, '*');
  result = result.replace(/±/g, '+-');

  const TRIG_FUNCTIONS = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc',
                          'arcsin', 'arccos', 'arctan',
                          'sinh', 'cosh', 'tanh'];
  const LOG_FUNCTIONS = ['log', 'ln', 'exp'];

  TRIG_FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(fn + '\\s*(?=\\w)', 'gi'), fn);
    result = result.replace(new RegExp('(\\w)' + fn, 'gi'), '$1' + fn);
  });

  LOG_FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(fn + '\\s*(?=\\w)', 'gi'), fn);
    result = result.replace(new RegExp('(\\w)' + fn, 'gi'), '$1' + fn);
  });

  result = result.replace(/\s+/g, '');

  result = result.toLowerCase().trim();

  return result;
}

export function localMathMatch(userAnswer: string, correctAnswer: string): boolean {
  const normUser = normalizeLatexForComparison(userAnswer);
  const normCorrect = normalizeLatexForComparison(correctAnswer);

  if (normUser === normCorrect) return true;
  if (normUser.includes(normCorrect)) return true;
  if (normCorrect.includes(normUser)) return true;

  const userSymbols = normUser.replace(/[\s+\-*/^()=]/g, '');
  const correctSymbols = normCorrect.replace(/[\s+\-*/^()=]/g, '');
  if (userSymbols === correctSymbols) return true;

  return false;
}

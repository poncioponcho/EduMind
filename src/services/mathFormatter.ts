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
];

const BARE_LATEX_PATTERN = new RegExp(
  '\\\\(?:' + LATEX_COMMANDS.join('|') + ')\\b',
  'g'
);

export function autoWrapMath(text: string): string {
  if (!text) return text;

  const blockMathRegex = /\$\$([\s\S]*?)\$\$/g;
  const inlineMathRegex = /\$([^\$]+?)\$/g;

  let result = text;

  result = result.replace(blockMathRegex, (_, content) => {
    return `$$${content}$$`;
  });

  result = result.replace(inlineMathRegex, (_, content) => {
    return `$${content}$`;
  });

  const parts = result.split(/(\$\$[\s\S]*?\$\$|\$[^\$]+?\$)/g);

  const processed = parts.map(part => {
    if (part.startsWith('$$') || (part.startsWith('$') && !part.startsWith('$$'))) {
      return part;
    }

    if (!BARE_LATEX_PATTERN.test(part)) {
      BARE_LATEX_PATTERN.lastIndex = 0;
      return part;
    }
    BARE_LATEX_PATTERN.lastIndex = 0;

    const segments = part.split(/(\s*[.,;:!?)\]]\s*)/g);
    const wrapped = segments.map(seg => {
      if (BARE_LATEX_PATTERN.test(seg)) {
        BARE_LATEX_PATTERN.lastIndex = 0;
        return `$${seg}$`;
      }
      BARE_LATEX_PATTERN.lastIndex = 0;
      return seg;
    });
    return wrapped.join('');
  });

  return processed.join('');
}

export function formatQuestionContent(content: string): string {
  if (!content) return content;

  let result = content;

  result = result.replace(/\\\\frac/g, '\\frac');
  result = result.replace(/\\\\int/g, '\\int');
  result = result.replace(/\\\\lim/g, '\\lim');
  result = result.replace(/\\\\sum/g, '\\sum');
  result = result.replace(/\\\\sqrt/g, '\\sqrt');
  result = result.replace(/\\\\sin/g, '\\sin');
  result = result.replace(/\\\\cos/g, '\\cos');
  result = result.replace(/\\\\ln/g, '\\ln');
  result = result.replace(/\\\\pi/g, '\\pi');
  result = result.replace(/\\\\alpha/g, '\\alpha');
  result = result.replace(/\\\\to/g, '\\to');
  result = result.replace(/\\\\infty/g, '\\infty');
  result = result.replace(/\\\\cdot/g, '\\cdot');
  result = result.replace(/\\\\left/g, '\\left');
  result = result.replace(/\\\\right/g, '\\right');

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

import { useMemo } from 'react';
import katex from 'katex';
import { autoWrapMath, formatQuestionContent } from '@/services/mathFormatter';

interface MathContentProps {
  content: string;
  className?: string;
  as?: 'div' | 'span' | 'p' | 'h3';
}

function renderKaTeX(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: true,
      macros: {
        '\\R': '\\mathbb{R}',
        '\\N': '\\mathbb{N}',
        '\\Z': '\\mathbb{Z}',
        '\\Q': '\\mathbb{Q}',
        '\\C': '\\mathbb{C}',
      },
    });
  } catch {
    return displayMode
      ? `<span class="katex-error-block">${escapeHtml(latex)}</span>`
      : `<span class="katex-error">${escapeHtml(latex)}</span>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function processContent(rawContent: string): string {
  let content = formatQuestionContent(rawContent);
  content = autoWrapMath(content);

  const blockMathRegex = /\$\$([\s\S]*?)\$\$/g;
  content = content.replace(blockMathRegex, (_, latex) => {
    const rendered = renderKaTeX(latex.trim(), true);
    return `<div class="katex-display">${rendered}</div>`;
  });

  const inlineMathRegex = /\$([^\$]+?)\$/g;
  content = content.replace(inlineMathRegex, (_, latex) => {
    const rendered = renderKaTeX(latex.trim(), false);
    return `<span class="katex-inline">${rendered}</span>`;
  });

  const textParts = content.split(/(<(?:div|span) class="katex-[^"]*">[\s\S]*?<\/(?:div|span)>)/g);
  const processed = textParts.map(part => {
    if (part.startsWith('<div class="katex-') || part.startsWith('<span class="katex-')) {
      return part;
    }
    return part
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br/>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  });

  let result = processed.join('');

  if (!result.startsWith('<')) {
    result = '<p>' + result + '</p>';
  }

  return result;
}

export function MathContent({ content, className = '', as: Tag = 'div' }: MathContentProps) {
  const htmlContent = useMemo(() => {
    if (!content) return '';
    return processContent(content);
  }, [content]);

  return (
    <Tag
      className={`math-content ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}

export function renderMathContent(content: string): string {
  if (!content) return '';
  return processContent(content);
}

export { processContent };

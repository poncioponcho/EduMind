import { localMathMatch } from './mathFormatter';

const MCP_API_URL = import.meta.env.VITE_MCP_API_URL || 'http://localhost:8000';

interface EquivalenceResult {
  equivalent: boolean;
  method: 'semantic' | 'local' | 'exact';
  normalized_user?: string;
  normalized_correct?: string;
  suggestion?: string;
}

export async function checkMathEquivalence(
  userAnswer: string,
  correctAnswer: string
): Promise<EquivalenceResult> {
  if (!userAnswer.trim() || !correctAnswer.trim()) {
    return { equivalent: false, method: 'exact' };
  }

  if (userAnswer.trim() === correctAnswer.trim()) {
    return { equivalent: true, method: 'exact' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${MCP_API_URL}/api/math/equivalence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expression1: userAnswer.trim(),
        expression2: correctAnswer.trim(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return {
        equivalent: data.equivalent ?? false,
        method: 'semantic',
        normalized_user: data.normalized_expr1,
        normalized_correct: data.normalized_expr2,
        suggestion: data.suggestion,
      };
    }
  } catch {
    // Backend unavailable, fall through to local matching
  }

  const isLocalMatch = localMathMatch(userAnswer, correctAnswer);
  return {
    equivalent: isLocalMatch,
    method: 'local',
  };
}

export function validateMathAnswer(
  userAnswer: string,
  correctAnswer: string,
  questionType: 'choice' | 'fill_blank' | 'proof'
): Promise<EquivalenceResult> {
  if (questionType === 'choice') {
    return Promise.resolve({
      equivalent: userAnswer.trim() === correctAnswer.trim(),
      method: 'exact',
    });
  }

  if (questionType === 'proof') {
    const hasContent = userAnswer.trim().length > 10;
    return Promise.resolve({
      equivalent: hasContent,
      method: 'local',
      suggestion: hasContent ? undefined : '请提供更详细的证明过程',
    });
  }

  return checkMathEquivalence(userAnswer, correctAnswer);
}

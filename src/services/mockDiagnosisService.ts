import { IS_MOCK_MODE } from '@/config';
import { DIAGNOSIS_FLOWS, getFlowByTopic, getAllTopics, type MockMessage, type MockDiagnosisFlow } from '@/mocks/diagnosisFlow';

export type { MockMessage, MockDiagnosisFlow };
export { getFlowByTopic, getAllTopics, DIAGNOSIS_FLOWS };

export async function* streamDiagnosis(
  topic: string,
  userInput?: string
): AsyncGenerator<MockMessage, void, unknown> {
  const flow = getFlowByTopic(topic) || DIAGNOSIS_FLOWS[0];

  const steps = [...flow.steps];

  if (userInput && /怎么|如何|怎样|方法|技巧|练习|训练|题/.test(userInput)) {
    const branch = flow.branchSteps?.how_to;
    if (branch) {
      steps.push(...branch);
    }
  }

  for (const step of steps) {
    await new Promise(r => setTimeout(r, step.delay));
    yield step;
  }
}

export async function* streamTeachingMock(
  knowledgePointId: string,
  userMessage: string
): AsyncGenerator<MockMessage, void, unknown> {
  const topicMap: Record<string, string> = {
    limit: '极限', derivative: '导数', chain_rule: '链式法则',
    indefinite_integral: '不定积分', definite_integral: '定积分',
    quadratic: '二次函数',
  };

  const topic = topicMap[knowledgePointId] || '导数';
  const flow = getFlowByTopic(topic) || DIAGNOSIS_FLOWS[0];

  if (/怎么|如何|怎样|方法|练习|训练|题/.test(userMessage)) {
    const branch = flow.branchSteps?.how_to;
    if (branch) {
      for (const step of branch) {
        await new Promise(r => setTimeout(r, step.delay));
        yield step;
      }
      return;
    }
  }

  const tutorSteps = flow.steps.filter(s => s.role === 'tutor');
  if (tutorSteps.length > 0) {
    const pick = tutorSteps[Math.floor(Math.random() * tutorSteps.length)];
    await new Promise(r => setTimeout(r, pick.delay));
    yield pick;
  }
}

export const diagnosisService = {
  isMock: () => IS_MOCK_MODE,

  async *stream(topic: string, userInput?: string) {
    if (IS_MOCK_MODE) {
      yield* streamDiagnosis(topic, userInput);
    } else {
      yield {
        role: 'system' as const,
        content: '正在连接认知诊断服务...',
        delay: 0,
      };
    }
  },

  async *streamTeaching(knowledgePointId: string, userMessage: string) {
    if (IS_MOCK_MODE) {
      yield* streamTeachingMock(knowledgePointId, userMessage);
    }
  },
};

// ===== 系统核心类型 =====

export interface User {
  id: string;
  username: string;
  createdAt: number;
  learningStyle: 'visual' | 'logical' | 'practical';
}

// ===== Agent 类型 =====

export type AgentType = 'diagnostician' | 'tutor' | 'planner' | 'evaluator';

export interface AgentState {
  type: AgentType;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  icon: string;
  color: string;
  description: string;
  lastActive: number;
  taskCount: number;
}

export interface AgentMessage {
  id: string;
  agent: AgentType;
  content: string;
  timestamp: number;
  metadata?: {
    knowledgePoint?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    formula?: string;
    action?: 'diagnose' | 'teach' | 'plan' | 'evaluate' | 'hint' | 'praise';
    phase?: string;
  };
}

// ===== 知识点类型 =====

export interface KnowledgePoint {
  id: string;
  name: string;
  category: string;
  difficulty: number; // 1-5
  description: string;
  prerequisites: string[];
  related: string[];
  formulas?: string[];
  examples?: Example[];
  position: { x: number; y: number };
}

export interface Example {
  id: string;
  problem: string;
  solution: string;
  explanation: string;
}

// ===== 题库类型 =====

export type QuestionType = 'choice' | 'fill_blank' | 'proof';

export interface Question {
  id: string;
  knowledgePointId: string;
  type: QuestionType;
  content: string; // 支持 LaTeX
  options?: string[];
  answer: string;
  explanation: string;
  difficulty: number; // 1-5
  tags: string[];
}

// ===== 学习记录类型 =====

export interface LearningRecord {
  id: string;
  userId: string;
  knowledgePointId: string;
  status: 'locked' | 'available' | 'learning' | 'mastered';
  score: number; // 0-100
  attempts: number;
  lastReview: number;
  masteryLevel: number; // 0-1 BKT概率
}

// ===== 诊断类型 =====

export interface DiagnosisResult {
  weakPoints: string[];
  strongPoints: string[];
  recommendedPath: string[];
  overallLevel: 'beginner' | 'intermediate' | 'advanced';
  detailScores: Record<string, number>;
}

// ===== 教学会话类型 =====

export interface TeachingSession {
  id: string;
  userId: string;
  knowledgePointId: string;
  messages: TeachingMessage[];
  startTime: number;
  lastActive: number;
  status: 'active' | 'paused' | 'completed';
}

export interface TeachingMessage {
  id: string;
  role: 'student' | 'tutor';
  content: string;
  timestamp: number;
  type: 'text' | 'formula' | 'code' | 'image' | 'hint';
  metadata?: {
    formula?: string;
    knowledgePoint?: string;
    isSocratic?: boolean;
    hintLevel?: number;
    phase?: string;
    intent?: string;
  };
}

// ===== 学习路径类型 =====

export interface LearningPath {
  id: string;
  userId: string;
  nodes: PathNode[];
  edges: PathEdge[];
  createdAt: number;
  estimatedTime: number; // minutes
}

export interface PathNode {
  knowledgePointId: string;
  status: 'locked' | 'available' | 'completed';
  estimatedTime: number;
  order: number;
}

export interface PathEdge {
  from: string;
  to: string;
  type: 'prerequisite' | 'related';
}

// ===== 评估报告类型 =====

export interface EvaluationReport {
  id: string;
  userId: string;
  generatedAt: number;
  overallScore: number;
  categoryScores: Record<string, number>;
  knowledgeMastery: Record<string, number>;
  trends: TrendPoint[];
  suggestions: string[];
  timeSpent: number; // minutes
  questionsAnswered: number;
  accuracy: number;
}

export interface TrendPoint {
  date: string;
  score: number;
  questions: number;
}

// ===== WebSocket 消息类型 =====

export type WSMessageType = 
  | 'agent_status'
  | 'agent_message'
  | 'teaching_message'
  | 'diagnosis_result'
  | 'path_update'
  | 'report_ready'
  | 'error';

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
  timestamp: number;
}

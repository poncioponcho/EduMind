import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { sendTeachingMessage, getAgentStates, subscribeToAgentStates, getAgentColor, getAgentName } from '@/services/agentService';
import { mcpBridge } from '@/services/mcpBridge';
import { getKnowledgePoints, getQuestionsByKnowledgePoint } from '@/services/database';
import type { AgentState, KnowledgePoint, TeachingMessage, User } from '@/types';
import type { ToolCallResult } from '@/services/mcpBridge';
import { Send, BookOpen, Sparkles, ChevronRight, Zap, Image, Code, FileText, Loader2 } from 'lucide-react';

interface TeachingPageProps {
  user: User;
  onNavigate: (page: 'landing' | 'diagnosis' | 'teaching' | 'path' | 'report' | 'admin') => void;
}

export function TeachingPage({ onNavigate }: TeachingPageProps) {
  const [selectedKP, setSelectedKP] = useState<KnowledgePoint | null>(null);
  const [messages, setMessages] = useState<TeachingMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agents, setAgents] = useState<AgentState[]>(getAgentStates());
  const [showHint, setShowHint] = useState(false);
  const [useMCP, setUseMCP] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'unavailable'>('disconnected');
  const [activeTools, setActiveTools] = useState<ToolCallResult[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const knowledgePoints = getKnowledgePoints();

  useEffect(() => {
    const unsub = subscribeToAgentStates(setAgents);
    return unsub;
  }, []);

  useEffect(() => {
    if (useMCP) {
      mcpBridge.connect();
      const unsubStatus = mcpBridge.onStatusChange(setMcpStatus);
      const unsubTools = mcpBridge.onToolCall((tool) => {
        setActiveTools(prev => [...prev, tool]);
      });
      return () => {
        unsubStatus();
        unsubTools();
        mcpBridge.disconnect();
      };
    } else {
      mcpBridge.disconnect();
      setMcpStatus('disconnected');
    }
  }, [useMCP]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const startTeaching = (kp: KnowledgePoint) => {
    setSelectedKP(kp);
    const welcomeMsg: TeachingMessage = {
      id: `msg_${Date.now()}`,
      role: 'tutor',
      content: `你好！我是你的AI数学导师。今天我们来学习「${kp.name}」。\n\n${kp.description}\n\n核心概念：${kp.formulas?.join('、') || ''}\n\n在正式开始之前，你能告诉我你对这个主题了解多少吗？或者有任何具体的问题想要探讨？`,
      timestamp: Date.now(),
      type: 'text',
      metadata: {
        knowledgePoint: kp.id,
        isSocratic: true,
      },
    };
    setMessages([welcomeMsg]);
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedKP || isLoading) return;

    const studentMsg: TeachingMessage = {
      id: `msg_${Date.now()}`,
      role: 'student',
      content: input.trim(),
      timestamp: Date.now(),
      type: 'text',
    };

    setMessages(prev => [...prev, studentMsg]);
    setInput('');
    setIsLoading(true);
    setActiveTools([]);

    if (useMCP) {
      const result = await mcpBridge.teach(input.trim(), messages.map(m => ({ role: m.role, content: m.content })));

      if (result.error && result.phase === 'error') {
        const fallbackMsg = await sendTeachingMessage(input.trim(), selectedKP.id, messages);
        const systemNote: TeachingMessage = {
          id: `msg_note_${Date.now()}`,
          role: 'tutor',
          content: `⚠️ MCP服务暂时不可用（${result.message}），已切换到本地教学模式：`,
          timestamp: Date.now(),
          type: 'text',
          metadata: { knowledgePoint: selectedKP.id, isSocratic: false, phase: 'error' },
        };
        setMessages(prev => [...prev, systemNote, fallbackMsg]);
      } else {
        const tutorMsg: TeachingMessage = {
          id: `msg_${Date.now()}`,
          role: 'tutor',
          content: result.message,
          timestamp: Date.now(),
          type: 'text',
          metadata: {
            knowledgePoint: selectedKP.id,
            isSocratic: result.message.includes('？') || result.message.includes('?'),
            phase: result.phase,
          },
        };
        setMessages(prev => [...prev, tutorMsg]);
      }
    } else {
      const tutorMsg = await sendTeachingMessage(input.trim(), selectedKP.id, messages);
      setMessages(prev => [...prev, tutorMsg]);
    }
    setIsLoading(false);
  };

  const handleQuickAction = (action: string) => {
    setInput(action);
  };

  // 知识点选择界面
  if (!selectedKP) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">选择学习主题</h2>
          <p className="text-muted-foreground">选择一个知识点，与AI导师开始Socratic对话式学习</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {knowledgePoints.map(kp => {
            const questions = getQuestionsByKnowledgePoint(kp.id);
            return (
              <Card
                key={kp.id}
                onClick={() => startTeaching(kp)}
                className="group bg-card/50 border-border/50 p-5 cursor-pointer hover:bg-card/80 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/10"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 text-xs border border-indigo-500/20">
                    {kp.category}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {'★'.repeat(kp.difficulty)}{'☆'.repeat(5 - kp.difficulty)}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-indigo-400 transition-colors">
                  {kp.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {kp.description}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{questions.length} 道练习题</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 h-[calc(100vh-3.5rem)] flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedKP(null)}
            className="text-sm text-muted-foreground hover:text-white transition-colors"
          >
            ← 返回
          </button>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: getAgentColor('tutor') + '20' }}
            >
              <img src="/agent-tutor.png" alt="" className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-medium text-white">{getAgentName('tutor')}</span>
              <span className="text-xs text-muted-foreground ml-2">{selectedKP.name}</span>
            </div>
          </div>
          {agents.find(a => a.type === 'tutor')?.status === 'running' && (
            <span className="text-xs text-amber-400 animate-pulse">思考中...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={useMCP ? 'default' : 'outline'}
            onClick={() => setUseMCP(!useMCP)}
            className={useMCP ? 'bg-amber-500 hover:bg-amber-600 text-white text-xs' : 'border-white/20 text-white hover:bg-white/10 text-xs'}
          >
            <Zap className="w-3.5 h-3.5 mr-1" />
            MCP {useMCP ? 'ON' : 'OFF'}
            {useMCP && (
              <span className={`ml-1.5 w-1.5 h-1.5 rounded-full ${mcpStatus === 'connected' ? 'bg-green-400' : mcpStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowHint(!showHint)}
            className="border-white/20 text-white hover:bg-white/10 text-xs"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            提示
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate('path')}
            className="border-white/20 text-white hover:bg-white/10 text-xs"
          >
            <BookOpen className="w-3.5 h-3.5 mr-1" />
            路径
          </Button>
        </div>
      </div>

      {/* 提示面板 */}
      {showHint && selectedKP && (
        <Card className="bg-indigo-500/5 border-indigo-500/20 p-4 mb-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-indigo-400 mb-1">Socratic 教学法</h4>
              <p className="text-xs text-muted-foreground">
                AI导师不会直接给你答案，而是通过提问引导你思考。
                你可以：1) 回答导师的问题 2) 提出自己的疑问 3) 说"不懂"获取详细解释 4) 说"正确"确认理解
              </p>
              {selectedKP.formulas && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedKP.formulas.map((f, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-white/5 text-xs text-emerald-400 font-mono">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 对话区 */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 消息列表 */}
        <div className="flex-1 flex flex-col min-h-0">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto space-y-4 pr-2"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] ${msg.role === 'student' ? 'order-2' : 'order-1'}`}>
                  {msg.role === 'tutor' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <img src="/agent-tutor.png" alt="" className="w-5 h-5 rounded" />
                      <span className="text-xs text-muted-foreground">AI导师</span>
                      {msg.metadata?.isSocratic && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          Socratic
                        </span>
                      )}
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'student'
                        ? 'bg-indigo-500 text-white rounded-tr-sm'
                        : 'bg-white/5 text-white/90 border border-white/10 rounded-tl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 block">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center gap-2">
                    {useMCP && activeTools.length > 0 ? (
                      <>
                        <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                        <span className="text-xs text-amber-400">
                          调用 {activeTools.map(t => t.name).join(' → ')}...
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {useMCP && activeTools.length > 0 && !isLoading && (
              <Card className="bg-amber-500/5 border-amber-500/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-medium text-amber-400">MCP 工具调用</span>
                </div>
                <div className="space-y-2">
                  {activeTools.map((tool, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      {tool.name.includes('plot') || tool.name.includes('render') ? (
                        <Image className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                      ) : tool.name.includes('execute') || tool.name.includes('run_cell') ? (
                        <Code className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                      ) : tool.name.includes('search') || tool.name.includes('paper') ? (
                        <FileText className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <span className="text-white font-mono">{tool.name}</span>
                        {tool.result && (
                          <p className="text-muted-foreground mt-0.5 line-clamp-3">
                            {tool.result}
                          </p>
                        )}
                        {tool.result && (tool.result.includes('.png') || tool.result.includes('plots/')) && (
                          <img
                            src={mcpBridge.getPlotUrl(tool.result.match(/plots\/[^\s]+/)?.[0] || '')}
                            alt="MCP plot"
                            className="mt-2 rounded-lg max-w-full border border-white/10"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* 快捷操作 */}
          {messages.length > 0 && messages.length < 3 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {['我想了解这个概念的定义', '能给我一个例子吗？', '这和之前学的有什么联系？'].map((text) => (
                <button
                  key={text}
                  onClick={() => handleQuickAction(text)}
                  className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          {/* 输入区 */}
          <div className="mt-4 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="输入你的问题或回答..."
              className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground focus:border-indigo-500/50"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="bg-indigo-500 hover:bg-indigo-600 text-white px-4"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 右侧知识面板 */}
        <div className="hidden lg:block w-72 shrink-0">
          <Card className="bg-card/50 border-border/50 p-4 sticky top-0">
            <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              当前知识点
            </h4>
            <div className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground">名称</span>
                <p className="text-sm text-white font-medium">{selectedKP.name}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">分类</span>
                <p className="text-sm text-white">{selectedKP.category}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">难度</span>
                <div className="flex gap-0.5 mt-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-6 h-1.5 rounded-full ${i < selectedKP.difficulty ? 'bg-indigo-500' : 'bg-white/10'}`}
                    />
                  ))}
                </div>
              </div>
              {selectedKP.formulas && (
                <div>
                  <span className="text-xs text-muted-foreground">核心公式</span>
                  <div className="mt-1 space-y-1">
                    {selectedKP.formulas.map((f, i) => (
                      <div key={i} className="p-2 rounded bg-white/5 text-xs text-emerald-400 font-mono">
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedKP.prerequisites.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">前置知识</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedKP.prerequisites.map(prereqId => {
                      const prereq = knowledgePoints.find(k => k.id === prereqId);
                      return prereq ? (
                        <span key={prereqId} className="px-2 py-0.5 rounded bg-white/5 text-xs text-muted-foreground">
                          {prereq.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
              {selectedKP.related.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">相关知识</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedKP.related.map(relId => {
                      const rel = knowledgePoints.find(k => k.id === relId);
                      return rel ? (
                        <button
                          key={relId}
                          onClick={() => startTeaching(rel)}
                          className="px-2 py-0.5 rounded bg-indigo-500/10 text-xs text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                        >
                          {rel.name}
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

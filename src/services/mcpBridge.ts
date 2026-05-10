const MCP_API_URL = import.meta.env.VITE_MCP_API_URL || 'http://localhost:8000';
const MCP_WS_URL = import.meta.env.VITE_MCP_WS_URL || 'ws://localhost:8000/ws/events';

interface ToolCallResult {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

interface TeachResponse {
  message: string;
  tools_used: ToolCallResult[];
  phase: string;
  emotion: string;
  error?: string;
}

type ToolCallHandler = (tool: ToolCallResult) => void;
type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected') => void;

const SAFE_PATH_REGEX = /^[a-zA-Z0-9_\-\.]+$/;

class MCPBridge {
  private ws: WebSocket | null = null;
  private toolCallHandlers: ToolCallHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastHealthStatus: 'ok' | 'degraded' | 'down' = 'down';

  onToolCall(handler: ToolCallHandler) {
    this.toolCallHandlers.push(handler);
    return () => {
      this.toolCallHandlers = this.toolCallHandlers.filter(h => h !== handler);
    };
  }

  onStatusChange(handler: StatusHandler) {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
    };
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.notifyStatus('connecting');

    try {
      this.ws = new WebSocket(MCP_WS_URL);

      this.ws.onopen = () => {
        this.notifyStatus('connected');
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.startHealthCheck();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'tool_call' && data.tools_used) {
            for (const tool of data.tools_used) {
              this.toolCallHandlers.forEach(h => h(tool));
            }
          }
        } catch { /* ignore parse errors */ }
      };

      this.ws.onclose = () => {
        this.notifyStatus('disconnected');
        this.stopHealthCheck();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.notifyStatus('disconnected');
      };
    } catch {
      this.notifyStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHealthCheck();
    this.reconnectAttempts = 0;
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(5000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private startHealthCheck() {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(async () => {
      try {
        const res = await fetch(`${MCP_API_URL}/api/health`, {
          signal: AbortSignal.timeout(5000),
        });
        const data = await res.json();
        this.lastHealthStatus = data.llm_ready ? 'ok' : 'degraded';
      } catch {
        this.lastHealthStatus = 'down';
      }
    }, 30000);
  }

  private stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private notifyStatus(status: 'connecting' | 'connected' | 'disconnected') {
    this.statusHandlers.forEach(h => h(status));
  }

  async teach(message: string, history?: Array<{role: string; content: string}>): Promise<TeachResponse> {
    if (!message || !message.trim()) {
      return {
        message: '请输入你的问题',
        tools_used: [],
        phase: 'error',
        emotion: 'neutral',
        error: 'empty_message',
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 65000);

      const res = await fetch(`${MCP_API_URL}/api/teach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim().slice(0, 2000),
          user_id: 'local_user',
          history: (history || []).slice(-10),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errorDetail = res.status === 429
          ? '请求过于频繁，请稍后再试'
          : res.status === 503
            ? 'MCP服务暂时不可用'
            : `网络请求失败 (${res.status})`;
        return {
          message: errorDetail,
          tools_used: [],
          phase: 'error',
          emotion: 'neutral',
          error: `HTTP ${res.status}`,
        };
      }

      const data = await res.json();

      if (data.error && !data.message) {
        return {
          message: data.error,
          tools_used: [],
          phase: 'error',
          emotion: 'neutral',
          error: data.error,
        };
      }

      return {
        message: data.message || '',
        tools_used: data.tools_used || [],
        phase: data.phase || 'teaching',
        emotion: data.emotion || 'neutral',
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return {
          message: '请求超时，MCP服务响应时间过长。请稍后重试或使用MCP OFF模式。',
          tools_used: [],
          phase: 'error',
          emotion: 'neutral',
          error: 'timeout',
        };
      }
      return {
        message: '无法连接MCP服务。请确保后端已启动：cd edumind-mcp && python api/server.py',
        tools_used: [],
        phase: 'error',
        emotion: 'neutral',
        error: 'connection_failed',
      };
    }
  }

  getPlotUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;

    const filename = path.split('/').pop() || '';
    if (!filename || !SAFE_PATH_REGEX.test(filename)) {
      return '';
    }

    return `${MCP_API_URL}/plots/${filename}`;
  }

  getHealthStatus(): 'ok' | 'degraded' | 'down' {
    return this.lastHealthStatus;
  }
}

export const mcpBridge = new MCPBridge();
export type { ToolCallResult, TeachResponse };

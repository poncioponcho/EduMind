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

class MCPBridge {
  private ws: WebSocket | null = null;
  private toolCallHandlers: ToolCallHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
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
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private notifyStatus(status: 'connecting' | 'connected' | 'disconnected') {
    this.statusHandlers.forEach(h => h(status));
  }

  async teach(message: string, history?: Array<{role: string; content: string}>): Promise<TeachResponse> {
    try {
      const res = await fetch(`${MCP_API_URL}/api/teach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          user_id: 'local_user',
          history: history || [],
        }),
      });

      if (!res.ok) {
        return {
          message: '网络请求失败，请检查MCP服务是否启动',
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
    } catch {
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
    if (path.startsWith('http')) return path;
    const filename = path.split('/').pop();
    return `${MCP_API_URL}/plots/${filename}`;
  }
}

export const mcpBridge = new MCPBridge();
export type { ToolCallResult, TeachResponse };

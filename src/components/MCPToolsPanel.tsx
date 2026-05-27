import { getOnlineTools, getLocalOnlyTools, type MCPTool } from '@/mocks/mcpTools';
import { IS_MOCK_MODE } from '@/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function ToolCard({ tool }: { tool: MCPTool }) {
  const isLocal = tool.status === 'local_only';

  return (
    <div className={`p-3 rounded-lg border transition-all ${
      isLocal
        ? 'border-border bg-secondary/30 opacity-70'
        : 'border-border bg-card hover:border-primary/50'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{tool.icon}</span>
          <div>
            <div className="text-sm font-medium text-white">{tool.name}</div>
            <div className="text-xs text-muted-foreground">{tool.category}</div>
          </div>
        </div>
        <Badge
          variant={isLocal ? 'outline' : 'default'}
          className={`text-[10px] ${
            isLocal
              ? 'border-muted-foreground/30 text-muted-foreground'
              : 'bg-green-500/20 text-green-400 border-green-500/30'
          }`}
        >
          {isLocal ? '需本地后端' : '在线可用'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{tool.description}</p>
      {tool.exampleCall && (
        <code className="text-[10px] text-cyan-400/70 mt-1 block truncate">{tool.exampleCall}</code>
      )}
      {isLocal && (
        <p className="text-[10px] text-yellow-500/70 mt-1">
          需本地启动后端激活真实调用
        </p>
      )}
    </div>
  );
}

export function MCPToolsPanel() {
  const onlineTools = getOnlineTools();
  const localTools = getLocalOnlyTools();

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-muted-foreground">MCP 工具发现</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {onlineTools.length} 在线 / {localTools.length} 本地
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {IS_MOCK_MODE && (
          <div className="text-xs text-yellow-500/80 mb-3 p-2 bg-yellow-500/5 rounded border border-yellow-500/10">
            ⚠️ 演示模式：工具状态为预设数据，非实时检测
          </div>
        )}

        {onlineTools.length > 0 && (
          <div className="mb-3">
            <div className="text-xs text-green-400 mb-2 font-medium">在线工具</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {onlineTools.map(t => <ToolCard key={t.name} tool={t} />)}
            </div>
          </div>
        )}

        {localTools.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-medium">本地工具（需后端）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {localTools.map(t => <ToolCard key={t.name} tool={t} />)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

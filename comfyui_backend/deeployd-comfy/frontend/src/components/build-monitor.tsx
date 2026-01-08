'use client';

import { useEffect, useState } from 'react';
import { BuildProgress } from '@/types/models';
import { useWebSocket } from '@/lib/websocket';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Terminal, RefreshCw, CheckCircle, XCircle, Clock, Copy, ShieldCheck } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

interface BuildMonitorProps {
  buildId: string;
  onComplete?: () => void;
}

export function BuildMonitor({ buildId, onComplete }: BuildMonitorProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [verifyResult, setVerifyResult] = useState<{
    ok?: boolean;
    expected?: string[];
    present?: string[];
    missing?: string[];
  } | null>(null);
  const [progress, setProgress] = useState<BuildProgress | null>(null);

  // Fetch build details
  const { data: build, refetch } = useQuery({
    queryKey: ['build', buildId],
    queryFn: () => apiClient.builds.get(buildId),
    refetchInterval: (query) => {
      // Stop refetching when build is complete
      const build = query.state.data;
      return build?.build_status === 'success' || build?.build_status === 'failed' ? false : 2000;
    },
  });

  // WebSocket connection for real-time updates (room per build)
  const { messages, isConnected } = useWebSocket(`build:${buildId}`);

  // Seed initial logs once with tail (no constant polling)
  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.builds.logs(buildId, { limit: 200 })
        if (data?.logs) {
          setLogs(data.logs.map((l) => l.line))
        }
      } catch {}
    })()
  }, [buildId])

  useEffect(() => {
    messages.forEach((message) => {
      // Generic progress from WS
      if (message.type === 'progress') {
        if (message.data && typeof message.data === 'object') {
          const d = message.data as Partial<BuildProgress>
          if (typeof d.step === 'string' && typeof d.total === 'number' && typeof d.progress === 'number') {
            setProgress({
              step: d.step,
              total: d.total,
              progress: d.progress,
              message: typeof d.message === 'string' ? d.message : '',
            })
          }
        }
        return
      }
      if (message.type === 'status') {
        const data = message.data as { logs?: string } | null
        if (data && typeof data.logs === 'string') {
          setLogs((prev) => [...prev, data.logs])
        }
        return
      }
      // Additional build-specific events emitted by backend
      const asRecord = message as unknown as Record<string, unknown>
      if (asRecord.type === 'build_complete' || asRecord.type === 'error') {
        void refetch()
        if (onComplete) onComplete()
        return
      }
      if (asRecord.type === 'build_progress') {
        const step = typeof asRecord["step"] === 'string' ? (asRecord["step"] as string) : ''
        const total = typeof asRecord["total"] === 'number' ? (asRecord["total"] as number) : 0
        const msg = typeof asRecord["message"] === 'string' ? (asRecord["message"] as string) : ''
        const prog = typeof asRecord["progress"] === 'number' ? (asRecord["progress"] as number) : 0
        setProgress({ step, total, message: msg, progress: prog })
        return
      }
      if (typeof asRecord.line === 'string') {
        setLogs((prev) => [...prev, String(asRecord.line)])
      }
    });
  }, [messages, refetch, onComplete]);

  // Fetch initial logs
  useEffect(() => {
    if (build?.build_logs) {
      setLogs(build.build_logs.split('\n'));
    }
  }, [build?.build_logs]);

  const getStatusIcon = () => {
    switch (build?.build_status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'building':
        return <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (build?.build_status) {
      case 'success':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'building':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal className="h-5 w-5" />
            <div>
              <CardTitle>Build Monitor</CardTitle>
              <CardDescription>
                {build?.image_name}:{build?.tag}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <Badge variant={getStatusColor() as 'default' | 'destructive' | 'secondary' | 'outline'}>
              {build?.build_status || 'Unknown'}
            </Badge>
            {isConnected && (
              <Badge variant="outline" className="text-green-600">
                Live
              </Badge>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(logs.join('\n'))
                  toast.success('Logs copied to clipboard')
                } catch {
                  toast.error('Failed to copy logs')
                }
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Actions (top) */}
        {(build?.build_status === 'building' || build?.build_status === 'pending') && (
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await apiClient.builds.cancel(buildId)
                  await refetch()
                } catch {}
              }}
            >
              Cancel Build
            </Button>
          </div>
        )}
        {/* Progress Bar */}
        {progress && build?.build_status === 'building' && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{progress.step}</span>
              <span>{progress.progress}/{progress.total}</span>
            </div>
            <Progress value={(progress.progress / progress.total) * 100} />
            <p className="text-sm text-muted-foreground">{progress.message}</p>
          </div>
        )}

        {/* Build Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Started</p>
            <p className="font-medium">
              {build?.created_at ? new Date(build.created_at).toLocaleTimeString() : '-'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium">
              {build?.build_duration ? `${Math.round(build.build_duration)}s` : '-'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Image Size</p>
            <p className="font-medium">
              {build?.image_size ? `${(build.image_size / 1024 / 1024 / 1024).toFixed(2)} GB` : '-'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Registry</p>
            <p className="font-medium">
              {build?.registry_url || 'Local'}
            </p>
          </div>
        </div>

        {/* Build Logs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Build Logs</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="h-[300px] w-full rounded-md border bg-black p-4">
            <pre className="text-xs text-green-400 font-mono">
              {logs.length > 0 ? logs.join('\n') : 'Waiting for logs...'}
            </pre>
          </ScrollArea>
        </div>

        {/* Actions */}
        {build?.build_status === 'success' && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1">
              Push to Registry
            </Button>
            <Button className="flex-1">
              Deploy Container
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={async () => {
                try {
                  const result = await apiClient.builds.verifyNodes(buildId, [
                    'ComfyUI-KJNodes',
                    'ComfyUI_IPAdapter_plus',
                    'ComfyUI-GGUF',
                  ])
                  setVerifyResult(result)
                  toast.success(result.ok ? 'Custom nodes verified' : 'Some nodes missing')
                } catch (e) {
                  toast.error('Verification failed')
                }
              }}
            >
              <ShieldCheck className="h-4 w-4 mr-2" /> Verify Nodes
            </Button>
          </div>
        )}
        {build?.resolved_nodes && build.resolved_nodes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Installed Custom Nodes</h4>
            <div className="space-y-1 text-sm">
              {build.resolved_nodes.map((n, i) => (
                <div key={`${n.name}-${n.repository}-${i}`} className="flex items-center justify-between border rounded px-2 py-1">
                  <span>{n.name}</span>
                  <span className="text-muted-foreground truncate max-w-[70%]">{n.repository}{n.commit ? `@${n.commit}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {build?.build_status === 'failed' && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => refetch()}>
              Refresh
            </Button>
          </div>
        )}
      </CardContent>
      {verifyResult && (
        <div className="p-4">
          <h4 className="text-sm font-medium mb-2">Custom Nodes Verification</h4>
          <div className="text-sm">
            <p className="mb-1">Expected: {verifyResult.expected?.join(', ') || '-'}</p>
            <p className="mb-1 text-green-600">Present: {verifyResult.present?.join(', ') || '-'}</p>
            <p className="mb-1 text-red-600">Missing: {verifyResult.missing?.join(', ') || '-'}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

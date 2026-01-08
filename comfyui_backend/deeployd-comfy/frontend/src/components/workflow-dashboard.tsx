'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { WorkflowTable } from './workflow-table';
import { WorkflowUpload } from './workflow-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Search, Upload } from 'lucide-react';
import { BuildMonitor } from '@/components/build-monitor';
import { ExecutionsDashboard } from '@/components/executions-dashboard';

export function WorkflowDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [activeBuildId, setActiveBuildId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Avoid Radix/SSR hydration mismatches by rendering tabs only after mount
  useEffect(() => setMounted(true), []);

  const { data: workflows, isLoading, error, refetch } = useQuery({
    queryKey: ['workflows', searchTerm],
    queryFn: async () => {
      console.log('Fetching workflows...');
      try {
        const params: { limit: number; name_filter?: string } = { limit: 100 };
        if (searchTerm) {
          params.name_filter = searchTerm;
        }
        const result = await apiClient.workflows.list(params);
        console.log('Workflows fetched:', result);
        return result;
      } catch (err) {
        console.error('Error fetching workflows:', err);
        throw err;
      }
    },
  });

  if (!mounted) {
    return (
      <div className="space-y-6">
        <div className="text-sm text-muted-foreground">Loading dashboard…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search workflows..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => refetch()} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Workflow
        </Button>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="workflows" className="w-full">
        <TabsList>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="builds">Recent Builds</TabsTrigger>
          <TabsTrigger value="executions">Executions</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Workflows</CardTitle>
              <CardDescription>
                Manage your ComfyUI workflows and generate Docker containers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {console.log('Render state:', { isLoading, error, workflows })}
              {isLoading ? (
                <div className="text-center py-8">Loading workflows...</div>
              ) : error ? (
                <div className="text-center py-8 text-red-500">
                  Error loading workflows: {(error as Error).message}
                </div>
              ) : workflows && workflows.length > 0 ? (
                <WorkflowTable workflows={workflows} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No workflows found. Upload your first workflow to get started.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="builds">
          <Card>
            <CardHeader>
              <CardTitle>Recent Builds</CardTitle>
              <CardDescription className="flex items-center justify-between">
                <span>Monitor your Docker container builds</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/api/v1/containers/builds/cleanup', {
                      method: 'POST'
                    })
                  }}
                >
                  Clear Pending Builds
                </Button>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BuildsList onOpen={(id) => setActiveBuildId(id)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="executions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Executions</CardTitle>
              <CardDescription>Queue, History, Gallery, Presets, Requests, Docs</CardDescription>
            </CardHeader>
            <CardContent>
              <ExecutionsDashboard />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Upload Dialog */}
      {showUpload && (
        <WorkflowUpload
          open={showUpload}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            setShowUpload(false);
            refetch();
          }}
        />
      )}

      {activeBuildId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-full max-w-3xl bg-background rounded-lg p-4 shadow-lg border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Build Details</h3>
              <button onClick={() => setActiveBuildId(null)} className="text-sm text-muted-foreground">Close</button>
            </div>
            <BuildMonitor buildId={activeBuildId!} onComplete={() => {}} />
          </div>
        </div>
      )}
    </div>
  );
}

function BuildsList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: builds, isLoading } = useQuery({
    queryKey: ['builds'],
    queryFn: () => apiClient.builds.list(),
    refetchInterval: 5000,
  });

  if (isLoading) return <div>Loading builds...</div>;

  return (
    <div className="space-y-2">
      {builds?.map((build) => (
        <button key={build.id} onClick={() => onOpen(build.id)} className="flex items-center justify-between p-4 border rounded-lg w-full text-left hover:bg-muted/50">
          <div>
            <p className="font-medium">{build.image_name}:{build.tag}</p>
            <p className="text-sm text-muted-foreground">
              Status: <span className={`font-medium ${
                build.build_status === 'success' ? 'text-green-600' :
                build.build_status === 'failed' ? 'text-red-600' :
                build.build_status === 'building' ? 'text-yellow-600' :
                'text-gray-600'
              }`}>{build.build_status}</span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(build.created_at).toLocaleDateString()}
          </p>
        </button>
      ))}
    </div>
  );
}

// Replaced simple list with ExecutionsDashboard

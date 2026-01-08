'use client';

import { Workflow } from '@/types/models';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WorkflowAPIConfig } from './workflow-api-config';

interface WorkflowDetailProps {
  workflow: Workflow;
  open: boolean;
  onClose: () => void;
}

export function WorkflowDetail({ workflow, open, onClose }: WorkflowDetailProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-[1000px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{workflow.name}</DialogTitle>
          <DialogDescription>
            {workflow.description || 'No description provided'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5 gap-2">
            <TabsTrigger className="py-2 text-sm" value="overview">Overview</TabsTrigger>
            <TabsTrigger className="py-2 text-sm" value="definition">Definition</TabsTrigger>
            <TabsTrigger className="py-2 text-sm" value="dependencies">Dependencies</TabsTrigger>
            <TabsTrigger className="py-2 text-sm" value="parameters">Parameters</TabsTrigger>
            <TabsTrigger className="py-2 text-sm" value="api">API</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Version</p>
                <Badge variant="outline">v{workflow.version}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p className="text-sm">{new Date(workflow.created_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Updated</p>
                <p className="text-sm">{new Date(workflow.updated_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">ComfyUI Version</p>
                <p className="text-sm">{workflow.comfyui_version || 'Not specified'}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Quick Stats</p>
              <div className="flex gap-2">
                <Badge>{Object.keys(workflow.definition).length} nodes</Badge>
                <Badge>{workflow.parameters.length} parameters</Badge>
                {workflow.dependencies.custom_nodes && (
                  <Badge>{workflow.dependencies.custom_nodes.length} custom nodes</Badge>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="definition">
            <ScrollArea className="h-[400px] w-full rounded-md border p-4">
              <pre className="text-xs">
                {JSON.stringify(workflow.definition, null, 2)}
              </pre>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="dependencies" className="space-y-4">
            {workflow.dependencies.custom_nodes && workflow.dependencies.custom_nodes.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Custom Nodes</h4>
                <div className="flex flex-wrap gap-2">
                  {workflow.dependencies.custom_nodes.map((node, idx: number) => {
                    const label = typeof node === 'string'
                      ? node
                      : (() => {
                          const obj = node as Record<string, unknown>
                          const repo = typeof obj.repository === 'string' ? obj.repository : undefined
                          const cls = typeof obj.class_type === 'string' ? obj.class_type : undefined
                          return repo ? repo.split('/').slice(-1)[0].replace(/\.git$/, '') : (cls || JSON.stringify(obj))
                        })();
                    const key = typeof node === 'string'
                      ? `str:${node}`
                      : (() => {
                          const obj = node as Record<string, unknown>
                          const repo = typeof obj.repository === 'string' ? obj.repository : undefined
                          const cls = typeof obj.class_type === 'string' ? obj.class_type : undefined
                          return repo ? `repo:${repo}` : (cls ? `cls:${cls}` : `idx:${idx}`)
                        })();
                    return (
                      <Badge key={key} variant="secondary">{label}</Badge>
                    )
                  })}
                </div>
              </div>
            )}

            {workflow.dependencies.python_packages && workflow.dependencies.python_packages.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Python Packages</h4>
                <div className="flex flex-wrap gap-2">
                  {workflow.dependencies.python_packages.map((pkg) => (
                    <Badge key={pkg} variant="outline">{pkg}</Badge>
                  ))}
                </div>
              </div>
            )}

            {workflow.dependencies.models && Object.keys(workflow.dependencies.models).length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Models</h4>
                <div className="space-y-2">
                  {Object.entries(workflow.dependencies.models).map(([type, models]) => (
                    <div key={type}>
                      <p className="text-sm font-medium text-muted-foreground">{type}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {models.map((model) => (
                          <Badge key={model} variant="outline" className="text-xs">
                            {model}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="parameters">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {workflow.parameters.map((param) => (
                  <div key={param.name} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{param.name}</p>
                        {param.description && (
                          <p className="text-sm text-muted-foreground">{param.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={param.required ? 'default' : 'secondary'}>
                          {param.required ? 'Required' : 'Optional'}
                        </Badge>
                        <Badge variant="outline">{param.type}</Badge>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      {param.default !== undefined && (
                        <p>Default: <code className="px-1 py-0.5 bg-muted rounded">{JSON.stringify(param.default)}</code></p>
                      )}
                      {param.min !== undefined && (
                        <p>Min: {param.min}</p>
                      )}
                      {param.max !== undefined && (
                        <p>Max: {param.max}</p>
                      )}
                      {param.options && param.options.length > 0 && (
                        <div>
                          <p>Options:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {param.options.map((opt) => (
                              <Badge key={opt} variant="outline" className="text-xs">
                                {opt}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="api">
            <WorkflowAPIConfig workflowId={workflow.id} />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button>Build Container</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

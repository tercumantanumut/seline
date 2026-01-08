'use client';

import { useState } from 'react';
import { Workflow } from '@/types/models';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Rocket, Download, Trash2 } from 'lucide-react';
import { WorkflowDetail } from './workflow-detail';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { BuildDrawer } from './build-drawer';
import { ExecDrawer } from './executions/exec-drawer';

interface WorkflowTableProps {
  workflows: Workflow[];
}

export function WorkflowTable({ workflows }: WorkflowTableProps) {
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [activeBuildId, setActiveBuildId] = useState<string | null>(null);
  const [showBuildOpts, setShowBuildOpts] = useState<Workflow | null>(null);
  const [drawerWorkflow, setDrawerWorkflow] = useState<Workflow | null>(null);
  const [runWorkflowId, setRunWorkflowId] = useState<string | null>(null);
  const [pythonVersion, setPythonVersion] = useState<'3.11' | '3.12' | '3.13'>('3.12');
  const [noCache, setNoCache] = useState(false);
  const [resolvedNodes, setResolvedNodes] = useState<{ name: string; repository: string; commit?: string; pip?: string[] }[]>([]);
  const [manualRepos, setManualRepos] = useState<Record<string, string>>({});
  const [extraNodes, setExtraNodes] = useState<{ name: string; repository: string; commit?: string }[]>([]);
  const [modelAssets, setModelAssets] = useState<{ type: string; filename: string; url: string }[]>([]);

  const handleBuild = async (workflow: Workflow) => {
    setShowBuildOpts(workflow);
    // Pre-seed models from workflow dependencies for better UX
    try {
      const deps = (workflow.dependencies?.models || {}) as Record<string, string[]>;
      const seeded: { type: string; filename: string; url: string }[] = [];
      Object.entries(deps).forEach(([type, files]) => {
        (files || []).forEach((f) => seeded.push({ type, filename: f, url: '' }))
      })
      setModelAssets(seeded)
    } catch {}
    try {
      const res = await apiClient.workflows.resolveNodes(workflow.id)
      setResolvedNodes(res)
      setManualRepos({})
    } catch {}
    // Open new Build Drawer UI
    setDrawerWorkflow(workflow)
  };

  const handleDelete = async (workflow: Workflow) => {
    if (!confirm(`Are you sure you want to delete "${workflow.name}"?`)) {
      return;
    }

    try {
      await apiClient.workflows.delete(workflow.id);
      toast.success('Workflow deleted successfully');
      // You'd want to refresh the list here
    } catch {
      toast.error('Failed to delete workflow');
    }
  };

  const handleRun = async (workflow: Workflow) => {
    setRunWorkflowId(workflow.id)
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Dependencies</TableHead>
            <TableHead>Parameters</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workflows.map((workflow) => (
            <TableRow key={workflow.id}>
              <TableCell className="font-medium">
                <div>
                  <p>{workflow.name}</p>
                  {workflow.description && (
                    <p className="text-sm text-muted-foreground">
                      {workflow.description}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">v{workflow.version}</Badge>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  {workflow.dependencies.custom_nodes && workflow.dependencies.custom_nodes.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {workflow.dependencies.custom_nodes.length} custom nodes
                    </Badge>
                  )}
                  {workflow.dependencies.models && Object.keys(workflow.dependencies.models).length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {Object.keys(workflow.dependencies.models).length} models
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge>{workflow.parameters.length} params</Badge>
              </TableCell>
              <TableCell>
                {new Date(workflow.created_at).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setSelectedWorkflow(workflow)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBuild(workflow)}>
                      <Rocket className="mr-2 h-4 w-4" />
                      Build Container
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleRun(workflow)}>
                      <Rocket className="mr-2 h-4 w-4" />
                      Run Execution
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => handleDelete(workflow)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedWorkflow && (
        <WorkflowDetail
          workflow={selectedWorkflow}
          open={!!selectedWorkflow}
          onClose={() => setSelectedWorkflow(null)}
        />
      )}

      {/* Build overlay removed in favor of BuildDrawer */}

      {drawerWorkflow && (
        <BuildDrawer workflow={drawerWorkflow} open={!!drawerWorkflow} onClose={() => setDrawerWorkflow(null)} />
      )}

      {runWorkflowId && (
        <ExecDrawer workflowId={runWorkflowId} open onClose={() => setRunWorkflowId(null)} />
      )}
    </>
  );
}

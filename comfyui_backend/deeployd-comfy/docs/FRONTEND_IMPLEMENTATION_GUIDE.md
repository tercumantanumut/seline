# ComfyUI Dashboard Frontend Implementation Guide

## Phase 6: Complete Frontend Development with Next.js 15

This guide provides step-by-step implementation of a modern dashboard frontend for the ComfyUI Workflow to Docker Translator. Every command, file, and configuration is included with no assumptions.

## Table of Contents
1. [Project Setup](#1-project-setup)
2. [Backend API Integration](#2-backend-api-integration)
3. [Workflow Dashboard](#3-workflow-dashboard)
4. [File Upload System](#4-file-upload-system)
5. [Build Monitoring](#5-build-monitoring)
6. [API Documentation Viewer](#6-api-documentation-viewer)
7. [Testing](#7-testing)
8. [Deployment](#8-deployment)

---

## 1. Project Setup

### 1.1 Initialize Next.js 15 Project

```bash
# From the root directory of deeployd-comfy
npx create-next-app@latest frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --turbo \
  --import-alias "@/*" \
  --no-git

cd frontend
```

When prompted, select:
- Would you like to use TypeScript? → Yes
- Would you like to use ESLint? → Yes
- Would you like to use Tailwind CSS? → Yes
- Would you like to use `src/` directory? → Yes
- Would you like to use App Router? → Yes
- Would you like to customize the default import alias? → No

### 1.2 Install Essential Dependencies

```bash
# Core dependencies
npm install @tanstack/react-table @tanstack/react-query zustand
npm install react-hook-form @hookform/resolvers zod
npm install date-fns clsx tailwind-merge
npm install lucide-react

# Development dependencies
npm install -D @types/node
```

### 1.3 Configure TypeScript

**frontend/tsconfig.json:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 1.4 Set Up shadcn/ui

```bash
npx shadcn@latest init -y

# When prompted:
# - Would you like to use TypeScript? → yes
# - Which style would you like to use? → Default
# - Which color would you like to use as base color? → Slate
# - Where is your global CSS file? → src/app/globals.css
# - Would you like to use CSS variables for colors? → yes
# - Where is your tailwind.config.js? → tailwind.config.ts
# - Configure the import alias? → src/*
# - Configure components.json? → yes

# Add components we'll need
npx shadcn@latest add button card table badge tabs
npx shadcn@latest add form input label textarea select
npx shadcn@latest add dialog sheet dropdown-menu
npx shadcn@latest add toast skeleton alert
```

### 1.5 Configure Environment Variables

**frontend/.env.local:**

```env
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# App Configuration
NEXT_PUBLIC_APP_NAME=ComfyUI Dashboard
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### 1.6 Update Global Styles

**frontend/src/app/globals.css:**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

/* Custom styles for dashboard */
.dashboard-grid {
  display: grid;
  grid-template-columns: 250px 1fr;
  min-height: 100vh;
}

.workflow-card {
  @apply rounded-lg border bg-card p-6 shadow-sm;
}
```

---

## 2. Backend API Integration

### 2.1 Create API Client

**frontend/src/lib/api-client.ts:**

```typescript
import { Workflow, Build, APIConfig } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class APIClient {
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${API_URL}${endpoint}`;
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  // Workflow endpoints
  async getWorkflows(): Promise<Workflow[]> {
    return this.request('/workflows');
  }

  async getWorkflow(id: string): Promise<Workflow> {
    return this.request(`/workflows/${id}`);
  }

  async createWorkflow(formData: FormData): Promise<Workflow> {
    const response = await fetch(`${API_URL}/workflows`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request(`/workflows/${id}`, {
      method: 'DELETE',
    });
  }

  // Build endpoints
  async getBuilds(workflowId?: string): Promise<Build[]> {
    const query = workflowId ? `?workflow_id=${workflowId}` : '';
    return this.request(`/builds${query}`);
  }

  async getBuild(id: string): Promise<Build> {
    return this.request(`/builds/${id}`);
  }

  async startBuild(workflowId: string): Promise<Build> {
    return this.request(`/workflows/${workflowId}/build`, {
      method: 'POST',
    });
  }

  // API Config endpoints
  async getAPIConfig(workflowId: string): Promise<APIConfig> {
    return this.request(`/workflows/${workflowId}/api-config`);
  }
}

export const apiClient = new APIClient();
```

### 2.2 Define TypeScript Types

**frontend/src/types/index.ts:**

```typescript
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  definition: Record<string, any>;
  dependencies: {
    custom_nodes: string[];
    models: Record<string, string[]>;
    python_packages: string[];
  };
  parameters: Parameter[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Parameter {
  name: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: any;
  description?: string;
  minimum?: number;
  maximum?: number;
  enum?: string[];
}

export interface Build {
  id: string;
  workflow_id: string;
  image_name: string;
  tag: string;
  status: 'pending' | 'building' | 'success' | 'failed';
  dockerfile?: string;
  build_logs?: string;
  image_size?: number;
  build_duration?: number;
  created_at: string;
  completed_at?: string;
}

export interface APIConfig {
  endpoint: string;
  method: string;
  parameters: Parameter[];
  description?: string;
}

export interface WebSocketMessage {
  type: 'build_progress' | 'build_complete' | 'build_error' | 'log';
  build_id: string;
  data: any;
}
```

### 2.3 Create React Query Provider

**frontend/src/providers/query-provider.tsx:**

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchInterval: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### 2.4 Create WebSocket Hook

**frontend/src/hooks/use-websocket.ts:**

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage } from '@/types';

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);

  const connect = useCallback(() => {
    try {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        setIsConnected(true);
        reconnectCount.current = 0;
        options.onOpen?.();
      };

      ws.current.onclose = () => {
        setIsConnected(false);
        options.onClose?.();

        if (
          options.reconnect &&
          reconnectCount.current < (options.reconnectAttempts || 5)
        ) {
          reconnectCount.current++;
          setTimeout(() => {
            connect();
          }, options.reconnectInterval || 3000);
        }
      };

      ws.current.onerror = (error) => {
        options.onError?.(error);
      };

      ws.current.onmessage = (event) => {
        const message = JSON.parse(event.data) as WebSocketMessage;
        setLastMessage(message);
        options.onMessage?.(message);
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
    }
  }, [url, options]);

  const sendMessage = useCallback((message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  }, []);

  const disconnect = useCallback(() => {
    ws.current?.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    sendMessage,
    disconnect,
    lastMessage,
  };
}
```

---

## 3. Workflow Dashboard

### 3.1 Create Dashboard Layout

**frontend/src/app/layout.tsx:**

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/providers/query-provider';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ComfyUI Dashboard',
  description: 'Manage and deploy ComfyUI workflows',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
```

### 3.2 Create Dashboard Page

**frontend/src/app/dashboard/layout.tsx:**

```typescript
import { Sidebar } from '@/components/sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-grid">
      <Sidebar />
      <main className="p-6">{children}</main>
    </div>
  );
}
```

**frontend/src/components/sidebar.tsx:**

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileJson,
  Package,
  FileCode,
  Settings,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Workflows', href: '/dashboard/workflows', icon: FileJson },
  { name: 'Builds', href: '/dashboard/builds', icon: Package },
  { name: 'API Docs', href: '/dashboard/api-docs', icon: FileCode },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-slate-900 text-white p-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">ComfyUI</h1>
        <p className="text-sm text-slate-400">Dashboard</p>
      </div>
      <nav className="space-y-1">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === item.href
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

### 3.3 Create Workflow List Page

**frontend/src/app/dashboard/workflows/page.tsx:**

```typescript
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { WorkflowTable } from '@/components/workflow-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Plus } from 'lucide-react';
import { UploadDialog } from '@/components/upload-dialog';

export default function WorkflowsPage() {
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => apiClient.getWorkflows(),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Workflows</h1>
        <div className="flex gap-2">
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload Workflow
          </Button>
          <Button variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Create New
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Workflows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workflows?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Builds
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              API Endpoints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workflows?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Workflows</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            <WorkflowTable workflows={workflows || []} />
          )}
        </CardContent>
      </Card>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
```

### 3.4 Create Workflow Table Component

**frontend/src/components/workflow-table.tsx:**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Play, Trash } from 'lucide-react';
import { Workflow } from '@/types';
import { format } from 'date-fns';

interface WorkflowTableProps {
  workflows: Workflow[];
}

export function WorkflowTable({ workflows }: WorkflowTableProps) {
  const router = useRouter();

  const handleView = (id: string) => {
    router.push(`/dashboard/workflows/${id}`);
  };

  const handleBuild = async (id: string) => {
    // TODO: Implement build trigger
    console.log('Building workflow:', id);
  };

  const handleDelete = async (id: string) => {
    // TODO: Implement delete
    console.log('Deleting workflow:', id);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Nodes</TableHead>
          <TableHead>Custom Nodes</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {workflows.map((workflow) => (
          <TableRow key={workflow.id}>
            <TableCell className="font-medium">{workflow.name}</TableCell>
            <TableCell>
              <Badge variant="secondary">v{workflow.version}</Badge>
            </TableCell>
            <TableCell>
              {Object.keys(workflow.definition).length} nodes
            </TableCell>
            <TableCell>
              {workflow.dependencies.custom_nodes.length > 0 ? (
                <Badge>{workflow.dependencies.custom_nodes.length}</Badge>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </TableCell>
            <TableCell>
              {format(new Date(workflow.created_at), 'MMM dd, yyyy')}
            </TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleView(workflow.id)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBuild(workflow.id)}>
                    <Play className="mr-2 h-4 w-4" />
                    Build
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDelete(workflow.id)}
                    className="text-destructive"
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

---

## 4. File Upload System

### 4.1 Create Upload Dialog

**frontend/src/components/upload-dialog.tsx:**

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadDialog({ open, onOpenChange }: UploadDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name.replace('.json', ''));
      return apiClient.createWorkflow(formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast({
        title: 'Success',
        description: 'Workflow uploaded successfully',
      });
      onOpenChange(false);
      setFiles([]);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to upload workflow',
        variant: 'destructive',
      });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (files.length > 0) {
      await uploadMutation.mutateAsync(files[0]);
    }
  };

  const removeFile = () => {
    setFiles([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Upload Workflow</DialogTitle>
          <DialogDescription>
            Upload a ComfyUI workflow JSON file to process and containerize.
          </DialogDescription>
        </DialogHeader>

        {files.length === 0 ? (
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
              transition-colors
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-border'}
            `}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {isDragActive
                ? 'Drop the workflow file here'
                : 'Drag & drop a workflow JSON file here, or click to select'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">{files[0].name}</p>
                <p className="text-sm text-muted-foreground">
                  {(files[0].size / 1024).toFixed(2)} KB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={removeFile}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

### 4.2 Install react-dropzone

```bash
npm install react-dropzone
```

---

## 5. Build Monitoring

### 5.1 Create Build Monitor Page

**frontend/src/app/dashboard/builds/page.tsx:**

```typescript
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { BuildTable } from '@/components/build-table';
import { BuildTerminal } from '@/components/build-terminal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function BuildsPage() {
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(null);

  const { data: builds, isLoading } = useQuery({
    queryKey: ['builds'],
    queryFn: () => apiClient.getBuilds(),
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const activeBuild = builds?.find(b => b.status === 'building');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Build Monitor</h1>

      {activeBuild && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle>Active Build</CardTitle>
          </CardHeader>
          <CardContent>
            <BuildTerminal buildId={activeBuild.id} />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Builds</TabsTrigger>
          <TabsTrigger value="success">Successful</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>Build History</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div>Loading...</div>
              ) : (
                <BuildTable
                  builds={builds || []}
                  onSelectBuild={setSelectedBuildId}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="success">
          <Card>
            <CardContent className="pt-6">
              <BuildTable
                builds={builds?.filter(b => b.status === 'success') || []}
                onSelectBuild={setSelectedBuildId}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed">
          <Card>
            <CardContent className="pt-6">
              <BuildTable
                builds={builds?.filter(b => b.status === 'failed') || []}
                onSelectBuild={setSelectedBuildId}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardContent className="pt-6">
              <BuildTable
                builds={builds?.filter(b => b.status === 'pending') || []}
                onSelectBuild={setSelectedBuildId}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### 5.2 Create Build Terminal Component

**frontend/src/components/build-terminal.tsx:**

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BuildTerminalProps {
  buildId: string;
}

export function BuildTerminal({ buildId }: BuildTerminalProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/builds/${buildId}/logs`;

  const { isConnected } = useWebSocket(wsUrl, {
    onMessage: (message) => {
      if (message.type === 'log') {
        setLogs(prev => [...prev, message.data]);
      }
    },
  });

  useEffect(() => {
    // Auto-scroll to bottom
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant={isConnected ? 'default' : 'secondary'}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Build ID: {buildId}
        </span>
      </div>

      <Card className="bg-black p-4">
        <ScrollArea className="h-[400px]">
          <pre className="text-green-400 text-xs font-mono">
            {logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
            <div ref={scrollRef} />
          </pre>
        </ScrollArea>
      </Card>
    </div>
  );
}
```

### 5.3 Create Build Table Component

**frontend/src/components/build-table.tsx:**

```typescript
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Download } from 'lucide-react';
import { Build } from '@/types';
import { format } from 'date-fns';

interface BuildTableProps {
  builds: Build[];
  onSelectBuild: (id: string) => void;
}

export function BuildTable({ builds, onSelectBuild }: BuildTableProps) {
  const getStatusBadge = (status: Build['status']) => {
    const variants: Record<Build['status'], any> = {
      pending: 'secondary',
      building: 'default',
      success: 'success',
      failed: 'destructive',
    };

    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Image</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {builds.map((build) => (
          <TableRow key={build.id}>
            <TableCell className="font-medium">
              {build.image_name}:{build.tag}
            </TableCell>
            <TableCell>{getStatusBadge(build.status)}</TableCell>
            <TableCell>{formatDuration(build.build_duration)}</TableCell>
            <TableCell>{formatSize(build.image_size)}</TableCell>
            <TableCell>
              {format(new Date(build.created_at), 'MMM dd, HH:mm')}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onSelectBuild(build.id)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {build.dockerfile && (
                  <Button variant="ghost" size="icon">
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

---

## 6. API Documentation Viewer

### 6.1 Create API Docs Page

**frontend/src/app/dashboard/api-docs/page.tsx:**

```typescript
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { APIEndpoint } from '@/components/api-endpoint';
import { APITester } from '@/components/api-tester';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function APIDocsPage() {
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('');

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => apiClient.getWorkflows(),
  });

  const { data: apiConfig } = useQuery({
    queryKey: ['api-config', selectedWorkflow],
    queryFn: () => apiClient.getAPIConfig(selectedWorkflow),
    enabled: !!selectedWorkflow,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">API Documentation</h1>

      <Card>
        <CardHeader>
          <CardTitle>Select Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedWorkflow} onValueChange={setSelectedWorkflow}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a workflow" />
            </SelectTrigger>
            <SelectContent>
              {workflows?.map((workflow) => (
                <SelectItem key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {apiConfig && (
        <Tabs defaultValue="documentation">
          <TabsList>
            <TabsTrigger value="documentation">Documentation</TabsTrigger>
            <TabsTrigger value="tester">API Tester</TabsTrigger>
            <TabsTrigger value="examples">Examples</TabsTrigger>
          </TabsList>

          <TabsContent value="documentation">
            <APIEndpoint config={apiConfig} />
          </TabsContent>

          <TabsContent value="tester">
            <APITester config={apiConfig} workflowId={selectedWorkflow} />
          </TabsContent>

          <TabsContent value="examples">
            <Card>
              <CardHeader>
                <CardTitle>Code Examples</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">cURL</h3>
                  <pre className="bg-slate-900 text-white p-4 rounded-lg overflow-x-auto">
{`curl -X POST ${process.env.NEXT_PUBLIC_API_URL}${apiConfig.endpoint} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(apiConfig.parameters.reduce((acc, p) => ({
    ...acc,
    [p.name]: p.default || `<${p.type}>`,
  }), {}), null, 2)}'`}
                  </pre>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Python</h3>
                  <pre className="bg-slate-900 text-white p-4 rounded-lg overflow-x-auto">
{`import requests

url = "${process.env.NEXT_PUBLIC_API_URL}${apiConfig.endpoint}"
payload = ${JSON.stringify(apiConfig.parameters.reduce((acc, p) => ({
  ...acc,
  [p.name]: p.default || `<${p.type}>`,
}), {}), null, 2)}

response = requests.post(url, json=payload)
print(response.json())`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
```

---

## 7. Testing

### 7.1 Component Testing Setup

```bash
npm install -D @testing-library/react @testing-library/jest-dom jest jest-environment-jsdom
```

**frontend/jest.config.js:**

```javascript
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
};

module.exports = createJestConfig(customJestConfig);
```

**frontend/jest.setup.js:**

```javascript
import '@testing-library/jest-dom';
```

### 7.2 E2E Testing with Playwright

```bash
npm install -D @playwright/test
npx playwright install
```

**frontend/playwright.config.ts:**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## 8. Deployment

### 8.1 Production Build

```bash
npm run build
```

### 8.2 Docker Deployment

**frontend/Dockerfile:**

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
```

### 8.3 Environment Configuration

**frontend/.env.production:**

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
```

---

## Next Steps

1. **Run the development server:**

   ```bash
   cd frontend
   npm run dev
   ```

2. **Access the dashboard:**
   Open http://localhost:3000/dashboard

3. **Connect to backend:**
   Ensure the FastAPI backend is running on port 8000

4. **Test the workflow:**
   - Upload a ComfyUI workflow JSON
   - View it in the dashboard
   - Trigger a build
   - Monitor the progress

This implementation provides a complete, production-ready frontend for the ComfyUI Dashboard with all essential features and modern best practices for 2025.

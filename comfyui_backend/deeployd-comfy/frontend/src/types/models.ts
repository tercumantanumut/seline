// Database model types matching SQLModel backend

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  definition: Record<string, unknown>;
  dependencies: {
    custom_nodes?: string[];
    python_packages?: string[];
    models?: Record<string, string[]>;
  };
  parameters: WorkflowParameter[];
  version: number;
  comfyui_version?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'file';
  default?: unknown;
  required: boolean;
  description?: string;
  min?: number;
  max?: number;
  options?: string[];
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version: number;
  commit_hash: string;
  parent_hash?: string;
  changes: Record<string, unknown>;
  message?: string;
  created_at: string;
}

export interface ContainerBuild {
  id: string;
  workflow_id: string;
  image_name: string;
  tag: string;
  registry_url?: string;
  build_status: 'pending' | 'building' | 'success' | 'failed';
  dockerfile?: string;
  build_logs?: string;
  resolved_nodes?: { name: string; repository: string; commit?: string; pip?: string[] }[];
  image_size?: number;
  build_duration?: number;
  created_at: string;
  completed_at?: string;
}

export interface CustomNode {
  id: string;
  repository_url: string;
  commit_hash: string;
  node_types: string[];
  python_dependencies: string[];
  compatible_comfyui_versions: string[];
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface APIEndpoint {
  id: string;
  workflow_id: string;
  path: string;
  method: string;
  parameters: WorkflowParameter[];
  request_schema: Record<string, unknown>;
  response_schema: Record<string, unknown>;
  rate_limit?: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  prompt_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input_parameters: Record<string, unknown>;
  output_files: string[];
  error_message?: string;
  execution_time?: number;
  started_at: string;
  completed_at?: string;
}

// WebSocket message types
export interface WSMessage {
  type: 'progress' | 'status' | 'error' | 'complete';
  prompt_id?: string;
  data: unknown;
  timestamp: string;
}

export interface BuildProgress {
  step: string;
  progress: number;
  total: number;
  message: string;
}

// API response types
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  dependencies?: Workflow['dependencies'];
  parameters?: WorkflowParameter[];
}

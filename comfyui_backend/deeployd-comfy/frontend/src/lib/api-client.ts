// Simple typed API client for the dashboard, aligned to backend /api/v1 routes

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const API_PREFIX = '/api/v1'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
    },
    // Allow sending FormData without overriding content-type
  })
  if (!res.ok) {
    let detail: string | undefined
    try {
      const parsed = (await res.json()) as unknown
      if (parsed && typeof parsed === 'object' && 'detail' in parsed) {
        const d = (parsed as { detail?: unknown }).detail
        if (typeof d === 'string') detail = d
      }
    } catch {}
    const msg = detail || res.statusText || 'Request failed'
    throw new Error(`${res.status} ${msg}`)
  }
  // Handle empty responses
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export type Workflow = import('@/types/models').Workflow
export type ContainerBuild = import('@/types/models').ContainerBuild
export type WorkflowExecution = import('@/types/models').WorkflowExecution
export type ValidationResult = import('@/types/models').ValidationResult

export const apiClient = {
  workflows: {
    async list(params?: { limit?: number; offset?: number; name_filter?: string }): Promise<Workflow[]> {
      const qs = new URLSearchParams()
      if (params?.limit != null) qs.set('limit', String(params.limit))
      if (params?.offset != null) qs.set('offset', String(params.offset))
      if (params?.name_filter) qs.set('name_filter', params.name_filter)
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      return http<Workflow[]>(`/workflows${suffix}`)
    },
    async get(id: string): Promise<Workflow> {
      return http<Workflow>(`/workflows/${id}`)
    },
    async delete(id: string): Promise<{ status: string; workflow_id: string }> {
      return http<{ status: string; workflow_id: string }>(`/workflows/${id}`, { method: 'DELETE' })
    },
    async create(form: FormData): Promise<Workflow> {
      // POST /workflows expects multipart form (file, name, description)
      return http<Workflow>(`/workflows`, { method: 'POST', body: form })
    },
    async validate(form: FormData): Promise<ValidationResult> {
      return http<ValidationResult>(`/workflows/validate`, { method: 'POST', body: form })
    },
    async resolveNodes(workflow_id: string, manual_repos?: Record<string, string>): Promise<{ name: string; repository: string; commit?: string; pip?: string[] }[]> {
      return http<{ name: string; repository: string; commit?: string; pip?: string[] }[]>(`/workflows/${workflow_id}/resolve_nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual_repos: manual_repos || {} }),
      })
    }
  },
  builds: {
    async list(limit = 25): Promise<ContainerBuild[]> {
      const qs = new URLSearchParams({ limit: String(limit) })
      return http<ContainerBuild[]>(`/containers/builds?${qs.toString()}`)
    },
    async create(
      workflow_id: string,
      opts?: { image_name?: string; tag?: string; no_cache?: boolean; python_version?: '3.11' | '3.12' | '3.13'; runtime_mode?: 'cpu' | 'gpu'; torch_version?: string; cuda_variant?: 'cu118'|'cu121'|'cu124'|'cu126'|'cu128'|'cu129'|'cpu'; manual_repos?: Record<string, string>; manual_nodes?: { name: string; repository: string; commit?: string }[]; model_assets?: { type: string; filename: string; url: string }[]; safe_mode?: boolean; accelerators?: ('xformers'|'triton'|'flash'|'sage'|'mamba')[]; compile_fallback?: boolean }
    ): Promise<ContainerBuild> {
      return http<ContainerBuild>(`/containers/builds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id,
          image_name: opts?.image_name,
          tag: opts?.tag ?? 'latest',
          no_cache: !!opts?.no_cache,
          python_version: opts?.python_version,
          manual_repos: opts?.manual_repos,
          runtime_mode: opts?.runtime_mode,
          torch_version: opts?.torch_version,
          cuda_variant: opts?.cuda_variant,
          manual_nodes: opts?.manual_nodes,
          model_assets: opts?.model_assets,
          safe_mode: opts?.safe_mode,
          accelerators: opts?.accelerators,
          compile_fallback: opts?.compile_fallback,
        }),
      })
    },
    async verifyNodes(build_id: string, nodes?: string[]): Promise<{ ok: boolean; expected: string[]; present: string[]; missing: string[] }> {
      return http<{ ok: boolean; expected: string[]; present: string[]; missing: string[] }>(`/containers/builds/${build_id}/verify_nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nodes && nodes.length ? { nodes } : {}),
      })
    },
    async get(build_id: string): Promise<ContainerBuild> {
      return http<ContainerBuild>(`/containers/builds/${build_id}`)
    },
    async logs(build_id: string, opts?: { since?: number; limit?: number }): Promise<{ build_id: string; logs: { seq: number; line: string; created_at: string }[]; next_since: number }> {
      const qs = new URLSearchParams()
      if (opts?.since != null) qs.set('since', String(opts.since))
      if (opts?.limit != null) qs.set('limit', String(opts.limit))
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      return http(`/containers/builds/${build_id}/logs${suffix}`)
    },
    async cancel(build_id: string): Promise<ContainerBuild> {
      return http<ContainerBuild>(`/containers/builds/${build_id}/cancel`, { method: 'POST' })
    },
  },
  executions: {
    async list(limit = 50): Promise<WorkflowExecution[]> {
      const qs = new URLSearchParams({ limit: String(limit) })
      return http<WorkflowExecution[]>(`/executions?${qs.toString()}`)
    },
    async create(workflow_id: string, parameters?: Record<string, string | number | boolean | null>): Promise<WorkflowExecution> {
      return http<WorkflowExecution>(`/executions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id, parameters: parameters || {} }),
      })
    },
    async get(execution_id: string): Promise<WorkflowExecution> {
      return http<WorkflowExecution>(`/executions/${execution_id}`)
    },
    async cancel(execution_id: string): Promise<WorkflowExecution> {
      return http<WorkflowExecution>(`/executions/${execution_id}/cancel`, { method: 'POST' })
    },
  },
}

export default apiClient

"use client";

import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { StatusPill } from '@/components/ui/status-pill'
import { toast } from 'sonner'

type Execution = import('@/types/models').WorkflowExecution

export function ExecDrawer({ executionId, workflowId, seedParams, open, onClose }: { executionId?: string; workflowId?: string; seedParams?: Record<string, string | number | boolean | null>; open: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState('form')
  const [execution, setExecution] = useState<Execution | null>(null)
  const [params, setParams] = useState<Record<string, string | number | boolean | null>>({})
  const [config, setConfig] = useState<{ parameters: { name:string; type:'string'|'number'|'boolean'|'integer'; required?:boolean; default?: string | number | boolean | null; description?:string }[] } | null>(null)
  const [logs, setLogs] = useState<string>("")
  const [comfyUrl, setComfyUrl] = useState<string | null>(null)
  const [service, setService] = useState<{ containers: { id:string; name:string; status:string; image:string; host_port?:string }[], error?: string } | null>(null)
  const [svcLoading, setSvcLoading] = useState(false)
  const eid = executionId || execution?.id || null

  // If viewing an existing execution, poll it
  useEffect(() => {
    if (!eid) return
    let t: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const e = await apiClient.executions.get(eid)
        setExecution(e)
        if (e && (e.status === 'pending' || e.status === 'running')) t = setTimeout(tick, 1500)
      } catch {}
    }
    tick()
    return () => { if (t) clearTimeout(t) }
  }, [eid])

  // Poll container logs for this execution
  useEffect(() => {
    if (!eid) return
    let cancelled = false
    const poll = async () => {
      try {
        const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
        const res = await fetch(`${base}/api/v1/executions/${eid}/container/logs?tail=400`)
        const j = (await res.json()) as { logs?: string }
        if (!cancelled && j.logs !== undefined) setLogs(j.logs || '')
        // Also sync status if still non-terminal
        try {
          if (!cancelled && (!execution || (execution.status === 'pending' || execution.status === 'running'))) {
            const exRes = await fetch(`${base}/api/v1/executions/${eid}`)
            if (exRes.ok) {
              const ex = (await exRes.json()) as Execution
              setExecution(ex)
            }
          }
        } catch {}
      } catch {}
    }
    const i = setInterval(poll, 1500)
    poll()
    return () => { cancelled = true; clearInterval(i) }
  }, [eid])

  // Load OpenAPI config for workflow and seed params
  useEffect(() => {
    if (!workflowId) return
    (async ()=>{
      try {
        const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
        const res = await fetch(`${base}/api/v1/workflows/${workflowId}/openapi-config`)
        const j = (await res.json()) as { parameters: { name:string; type:'string'|'number'|'boolean'|'integer'; required?:boolean; default?: string | number | boolean | null; description?:string }[] }
        setConfig(j)
        // seed
        const next: Record<string, string | number | boolean | null> = {}
        ;(j.parameters||[]).forEach((p) => {
          if (p.default !== undefined) next[p.name] = p.default
          else if (p.type === 'number' || p.type === 'integer') next[p.name] = 0
          else if (p.type === 'boolean') next[p.name] = false
          else next[p.name] = ''
        })
        setParams({ ...next, ...(seedParams || {}) })
      } catch {}
    })()
  }, [workflowId, seedParams])

  const startRun = async () => {
    if (!workflowId) return
    try {
      const e = await apiClient.executions.create(workflowId, params)
      setExecution(e)
      setActiveTab('live')
    } catch {}
  }

  const outputList = execution?.output_files ?? []

  return (
    <div className={`fixed inset-y-0 right-0 w-[920px] max-w-[92vw] bg-background border-l shadow-xl transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <div className="font-semibold">{execution ? `Run ${execution.id.slice(0,8)}` : 'New Execution'}</div>
            <div className="text-xs text-muted-foreground">{execution ? new Date(execution.started_at).toLocaleString() : 'Ready'}</div>
          </div>
          <div className="flex items-center gap-2">
            {execution && <StatusPill status={execution.status} />}
            {!execution && workflowId && <Button onClick={startRun}>Start</Button>}
            <Button variant="outline" onClick={async ()=>{
              try {
                const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
                const url = workflowId ? `${base}/api/v1/executions/comfy/resolve?workflow_id=${workflowId}` : (execution ? `${base}/api/v1/executions/${execution.id}/container/logs` : '')
                const res = await fetch(url)
                const j = await res.json()
                if (j.base_url) {
                  setComfyUrl(j.base_url)
                  toast.success(`ComfyUI: ${j.base_url}`)
                } else {
                  toast.error(j.error || 'Unable to resolve service')
                }
              } catch {}
            }}>Check ComfyUI</Button>
            {comfyUrl && <span className="text-xs text-muted-foreground">{comfyUrl}</span>}
            <Button variant="outline" onClick={async ()=>{
              if (!workflowId && !execution) return
              const wid = workflowId || execution?.workflow_id
              if (!wid) return
              setSvcLoading(true)
              try {
                const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
                const res = await fetch(`${base}/api/v1/executions/comfy/status?workflow_id=${wid}`)
                const j = await res.json()
                setService(j)
                setActiveTab('service')
                if (j.error) toast.error(j.error)
              } catch (e) {
                setService({ containers: [], error: String(e) })
                setActiveTab('service')
              } finally { setSvcLoading(false) }
            }}>Service Status</Button>
            <Button variant="outline" onClick={async ()=>{
              if (!workflowId && !execution) return
              const wid = workflowId || execution?.workflow_id
              if (!wid) return
              setSvcLoading(true)
              try {
                const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
                const res = await fetch(`${base}/api/v1/executions/comfy/restart?workflow_id=${wid}`, { method: 'POST' })
                const j = await res.json()
                if (j.base_url) {
                  setComfyUrl(j.base_url)
                  toast.success(`Service restarted at ${j.base_url}`)
                } else if (j.error) {
                  toast.error(j.error)
                }
                // refresh status after restart
                await new Promise(r => setTimeout(r, 1200))
                const sres = await fetch(`${base}/api/v1/executions/comfy/status?workflow_id=${wid}`)
                setService(await sres.json())
                setActiveTab('service')
              } catch (e) {
                setService({ containers: [], error: String(e) })
                setActiveTab('service')
              } finally { setSvcLoading(false) }
            }}>Restart Service</Button>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 py-3">
            <TabsList>
              <TabsTrigger value="form">Form</TabsTrigger>
              <TabsTrigger value="live">Live</TabsTrigger>
              <TabsTrigger value="outputs">Outputs</TabsTrigger>
              <TabsTrigger value="meta">Metadata</TabsTrigger>
              <TabsTrigger value="request">Request</TabsTrigger>
              <TabsTrigger value="compare">Compare</TabsTrigger>
              <TabsTrigger value="service">Service</TabsTrigger>
            </TabsList>

            <TabsContent value="form" className="mt-3 space-y-2">
              <div className="text-sm text-muted-foreground">Fill parameters defined for this workflow. Required fields are marked.</div>
              <div className="space-y-2">
                {(config?.parameters||[]).map((p, idx) => (
                  <div key={idx} className="grid grid-cols-6 gap-2 items-center">
                    <Label className="text-xs col-span-2">{p.name}{p.required ? <span className="text-red-500">*</span> : null}</Label>
                    <Input className="col-span-4" value={params[p.name] ?? ''} onChange={(e)=>setParams(obj=>({ ...obj, [p.name]: e.target.value }))} placeholder={p.description || p.type} />
                  </div>
                ))}
                {(!config || (config.parameters||[]).length===0) && (
                  <div className="text-xs text-muted-foreground">No parameters configured. Add them in the Workflow → API tab.</div>
                )}
              </div>
              {workflowId && <div className="flex justify-end"><Button onClick={startRun}>Start</Button></div>}
            </TabsContent>

            <TabsContent value="live" className="mt-3 space-y-2">
              {!execution && <div className="text-sm text-muted-foreground">No execution yet.</div>}
              {execution && (
                <div className="space-y-2">
                  <div className="text-sm">Status: <Badge variant="outline">{execution.status}</Badge></div>
                  <div className="border rounded p-3 text-xs font-mono bg-black text-green-400 min-h-[280px] max-h-[420px] overflow-auto whitespace-pre-wrap" id="exec-logs">
                    {logs || 'Waiting for container logs…'}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={async ()=>{ try{ await navigator.clipboard.writeText(logs||'') } catch{} }}>Copy Logs</Button>
                    <Button variant="outline" size="sm" onClick={()=>{
                      const blob = new Blob([logs||''], { type: 'text/plain;charset=utf-8' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `comfy_logs_${new Date().toISOString().replace(/[:.]/g,'-')}.txt`
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      URL.revokeObjectURL(url)
                    }}>Download Logs</Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="outputs" className="mt-3 space-y-2">
              {outputList.length === 0 && <div className="text-sm text-muted-foreground">No outputs captured.</div>}
              <div className="grid grid-cols-3 gap-2">
                {outputList.map((url, i) => (
                  <div key={i} className="border rounded overflow-hidden">
                    <img src={url} alt="output" className="w-full h-40 object-cover" />
                    <div className="p-2 text-xs flex items-center justify-between">
                      <span className="truncate" title={url}>{url}</span>
                      <a className="text-blue-600" href={url} target="_blank" rel="noreferrer">Open</a>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="meta" className="mt-3 space-y-2">
              {!execution && <div className="text-sm text-muted-foreground">No metadata available.</div>}
              {execution && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="border rounded p-2">
                    <div className="text-xs text-muted-foreground">Input Parameters</div>
                    <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(execution.input_parameters, null, 2)}</pre>
                  </div>
                  <div className="border rounded p-2">
                    <div className="text-xs text-muted-foreground">Execution Info</div>
                    <pre className="text-xs whitespace-pre-wrap">{JSON.stringify({ status: execution.status, started_at: execution.started_at, completed_at: execution.completed_at, execution_time: execution.execution_time, error_message: execution.error_message }, null, 2)}</pre>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="request" className="mt-3 space-y-2">
              {execution ? (
                <div className="text-xs text-muted-foreground">Show raw request after backend exposes it.</div>
              ) : (
                <div className="text-sm text-muted-foreground">Start a run to view the actual request.</div>
              )}
            </TabsContent>

            <TabsContent value="compare" className="mt-3 space-y-2">
              <div className="text-sm text-muted-foreground">Select another run from History to compare (coming soon).</div>
            </TabsContent>

            <TabsContent value="service" className="mt-3 space-y-2">
              <div className="text-sm text-muted-foreground">ComfyUI service containers for this workflow.</div>
              <div className="border rounded p-2 text-xs">
                {svcLoading && <div>Loading…</div>}
                {!svcLoading && service && service.containers && service.containers.length > 0 && (
                  <div className="space-y-1">
                    {service.containers.map((c,i)=> (
                      <div key={i} className="flex items-center justify-between border-b last:border-b-0 py-1">
                        <div className="truncate">
                          <div className="font-mono truncate">{c.image}</div>
                          <div className="text-muted-foreground">{c.name} • {c.id.slice(0,12)}</div>
                        </div>
                        <div className="text-right">
                          <div>Status: {c.status}</div>
                          <div>Port: {c.host_port || '-'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!svcLoading && service && service.containers && service.containers.length === 0 && (
                  <div className="text-muted-foreground">No containers found.</div>
                )}
                {service?.error && <div className="text-red-600">{service.error}</div>}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={async ()=>{
                  if (!workflowId && !execution) return
                  const wid = workflowId || execution?.workflow_id
                  if (!wid) return
                  setSvcLoading(true)
                  try {
                    const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
                    const res = await fetch(`${base}/api/v1/executions/comfy/status?workflow_id=${wid}`)
                    const j = await res.json()
                    setService(j)
                  } catch (e) {
                    setService({ containers: [], error: String(e) })
                  } finally { setSvcLoading(false) }
                }}>Refresh</Button>
                <Button variant="outline" size="sm" onClick={async ()=>{
                  if (!workflowId && !execution) return
                  const wid = workflowId || execution?.workflow_id
                  if (!wid) return
                  setSvcLoading(true)
                  try {
                    const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
                    const res = await fetch(`${base}/api/v1/executions/comfy/restart?workflow_id=${wid}`, { method: 'POST' })
                    const j = await res.json()
                    if (j.base_url) setComfyUrl(j.base_url)
                    const sres = await fetch(`${base}/api/v1/executions/comfy/status?workflow_id=${wid}`)
                    setService(await sres.json())
                  } catch (e) {
                    setService({ containers: [], error: String(e) })
                  } finally { setSvcLoading(false) }
                }}>Restart</Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

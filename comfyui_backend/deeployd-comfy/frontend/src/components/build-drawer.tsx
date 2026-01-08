"use client";

import { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { StatusPill } from '@/components/ui/status-pill'
import { TypeChip, RepoChip, CommitChip } from '@/components/ui/chips'
import { BuildMonitor } from '@/components/build-monitor'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

type Workflow = import('@/types/models').Workflow
type ContainerBuild = import('@/types/models').ContainerBuild

export function BuildDrawer({
  workflow,
  open,
  onClose,
}: { workflow: Workflow; open: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState('summary')
  const [build, setBuild] = useState<ContainerBuild | null>(null)
  const [buildId, setBuildId] = useState<string | null>(null)
  const [pythonVersion, setPythonVersion] = useState<'3.10' | '3.11' | '3.12' | '3.13'>('3.12')
  const [noCache, setNoCache] = useState(false)
  const [runtimeMode, setRuntimeMode] = useState<'cpu'|'gpu'>('cpu')
  const [safeMode, setSafeMode] = useState(false)
  const [torchVersion, setTorchVersion] = useState<string>('2.7.1')
  const [cudaVariant, setCudaVariant] = useState<'cu118'|'cu121'|'cu124'|'cu126'|'cu128'|'cu129'|'cpu'>('cpu')
  const [accelerators, setAccelerators] = useState<('xformers'|'triton'|'flash'|'sage'|'mamba')[]>(['xformers','triton','flash','sage'])
  const [compileFallback, setCompileFallback] = useState(true)
  const [installNunchaku, setInstallNunchaku] = useState(false)
  const [nunchakuVersion, setNunchakuVersion] = useState<string>('v0.3.1')
  const [nunchakuWheelUrl, setNunchakuWheelUrl] = useState<string>('')
  const [manualRepos, setManualRepos] = useState<Record<string, string>>({})
  const [resolvedNodes, setResolvedNodes] = useState<{ name: string; repository: string; commit?: string; pip?: string[] }[]>([])
  const [extraNodes, setExtraNodes] = useState<{ name: string; repository: string; commit?: string }[]>([])
  const [models, setModels] = useState<{ type: string; filename: string; url: string }[]>([])

  // Pre-seed models from dependencies on open
  useEffect(() => {
    if (!open) return
    const deps = (workflow.dependencies?.models || {}) as Record<string, string[]>
    const seeded: { type: string; filename: string; url: string }[] = []
    Object.entries(deps).forEach(([type, files]) => (files||[]).forEach(f => seeded.push({ type, filename: f, url: '' })))
    setModels(seeded)
    apiClient.workflows.resolveNodes(workflow.id)
      .then(setResolvedNodes)
      .catch((e) => { toast.error(`Resolve nodes failed: ${e instanceof Error ? e.message : String(e)}`) })
  }, [open, workflow])

  // Poll build status when buildId present
  useEffect(() => {
    if (!buildId) return
    let t: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const b = await apiClient.builds.get(buildId)
        setBuild(b)
        if (b.build_status === 'building') t = setTimeout(tick, 1000)
      } catch {}
    }
    tick()
    return () => { if (t) clearTimeout(t) }
  }, [buildId])

  const summaryCounts = useMemo(() => ({
    models: models.length,
    nodes: resolvedNodes.length + extraNodes.length,
  }), [models, resolvedNodes, extraNodes])

  const startBuild = async () => {
    try {
      // Normalize versions when accelerators are enabled
      let py = pythonVersion
      let tv = torchVersion
      let cu: 'cu118'|'cu121'|'cu124'|'cu126'|'cu128'|'cu129'|'cpu' = runtimeMode==='gpu' ? cudaVariant : 'cpu'
      if (runtimeMode==='gpu' && !safeMode) {
        // For GPU mode with accelerators, use Python 3.10 (CUDA base image default)
        if (py !== '3.10' && py !== '3.11' && py !== '3.12' && py !== '3.13') py = '3.10'
        tv = '2.8.0'
        cu = 'cu129' as any
      }
      const b = await apiClient.builds.create(workflow.id, {
        python_version: py,
        no_cache: noCache,
        runtime_mode: runtimeMode,
        torch_version: tv,
        cuda_variant: cu,
        safe_mode: safeMode,
        accelerators: runtimeMode==='gpu' && !safeMode ? accelerators : undefined,
        compile_fallback: compileFallback,
        install_nunchaku: installNunchaku,
        nunchaku_version: installNunchaku ? nunchakuVersion : undefined,
        nunchaku_wheel_url: installNunchaku && nunchakuWheelUrl ? nunchakuWheelUrl : undefined,
        manual_repos: manualRepos,
        manual_nodes: extraNodes.filter(n => n.repository && n.name),
        model_assets: models.filter(m => m.type && m.filename && m.url),
      })
      setBuildId(b.id)
      setBuild(b)
      setActiveTab('logs')
      toast.success('Build started')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const cancelBuild = async () => {
    if (!buildId) return
    try {
      await apiClient.builds.cancel(buildId)
      toast.success('Build canceled')
    } catch {
      toast.error('Cancel failed')
    }
  }

  return (
    <div className={`fixed inset-y-0 right-0 w-[920px] max-w-[92vw] bg-background border-l shadow-xl transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <div className="font-semibold">{workflow.name} <Badge variant="outline">v{workflow.version}</Badge></div>
            <div className="text-xs text-muted-foreground">Last updated {new Date(workflow.updated_at).toLocaleString()}</div>
          </div>
          <div className="flex items-center gap-2">
            {build && <StatusPill status={build.build_status} />}
            {!buildId && <Button onClick={startBuild}>Start Build</Button>}
            {buildId && build?.build_status === 'building' && <Button variant="destructive" onClick={cancelBuild}>Cancel</Button>}
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>

        {/* Subheader meta */}
        <div className="px-4 py-2 border-b text-xs text-muted-foreground flex items-center gap-4">
          <div>Python {pythonVersion}</div>
          <div>{noCache ? 'No cache' : 'Use cache'}</div>
          {build && <div>Image: {build.image_name}:{build.tag}</div>}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 py-3">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="models">Models</TabsTrigger>
              <TabsTrigger value="nodes">Custom Nodes</TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="verify">Verify</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="border rounded p-3">
                  <div className="text-xs text-muted-foreground">Models</div>
                  <div className="text-xl font-semibold">{summaryCounts.models}</div>
                </div>
                <div className="border rounded p-3">
                  <div className="text-xs text-muted-foreground">Custom Nodes</div>
                  <div className="text-xl font-semibold">{summaryCounts.nodes}</div>
                </div>
                <div className="border rounded p-3">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="mt-1">{build ? <StatusPill status={build.build_status} /> : <Badge variant="outline">Not built</Badge>}</div>
                </div>
              </div>
              {resolvedNodes.length > 0 && (
                <div className="border rounded p-3">
                  <div className="text-sm font-medium mb-2">Resolved Nodes</div>
                  <div className="flex flex-wrap gap-2">
                    {resolvedNodes.map((n, i) => (
                      <div key={i} className="border rounded px-2 py-1 text-xs flex items-center gap-2">
                        <span>{n.name}</span>
                        <RepoChip repo={n.repository} />
                        <CommitChip commit={n.commit} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="models" className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Detected from workflow: {models.length}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setModels(prev => [...prev, { type: '', filename: '', url: '' }])}>Add Model</Button>
                </div>
              </div>
              {/* Group by type */}
              <div className="space-y-2">
                {Object.entries(models.reduce<Record<string, { type: string; filename: string; url: string }[]>>((acc, m) => {(acc[m.type] ||= []).push(m); return acc}, {})).map(([type, items], gi) => (
                  <div key={gi} className="border rounded">
                    <div className="px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2"><TypeChip type={type || 'misc'} /><span className="text-xs text-muted-foreground">{items.length}</span></div>
                    </div>
                    <div className="divide-y">
                      {items.map((m, idx) => {
                        const index = models.findIndex(mm => mm === m)
                        return (
                          <div key={idx} className="grid grid-cols-7 gap-2 px-3 py-2 items-center">
                            <Input className="col-span-2" placeholder="Type" value={m.type} onChange={(e) => setModels(arr => arr.map((x,i) => i===index ? { ...x, type: e.target.value } : x))} />
                            <Input className="col-span-2" placeholder="Filename" value={m.filename} onChange={(e) => setModels(arr => arr.map((x,i) => i===index ? { ...x, filename: e.target.value } : x))} />
                            <Input className="col-span-3" placeholder="Source URL (HF or direct)" value={m.url} onChange={(e) => setModels(arr => arr.map((x,i) => i===index ? { ...x, url: e.target.value } : x))} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {models.length === 0 && <div className="text-sm text-muted-foreground border rounded p-3">No detected models. Add models or proceed without downloads.</div>}
              </div>
            </TabsContent>

            <TabsContent value="nodes" className="mt-3 space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Resolved Nodes</div>
                <div className="space-y-1 max-h-48 overflow-auto border rounded p-2">
                  {resolvedNodes.map((n, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2"><span>{n.name}</span><RepoChip repo={n.repository} /><CommitChip commit={n.commit} /></div>
                      <div className="text-xs text-muted-foreground">{(n.pip||[]).length} deps</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={async () => {
                    try { const res = await apiClient.workflows.resolveNodes(workflow.id, manualRepos); setResolvedNodes(res); toast.success('Nodes re-resolved'); } catch { toast.error('Resolution failed') }
                  }}>Re-resolve Nodes</Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Manual Overrides (name → repo)</div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(manualRepos).map(([k,v], i) => (
                    <div key={i} className="col-span-2 grid grid-cols-5 gap-2">
                      <Input className="col-span-2" value={k} onChange={(e) => {
                        setManualRepos(obj => { const o = { ...obj }; const old = k; const val = o[old]; delete o[old]; o[e.target.value] = val; return o })
                      }} placeholder="Name" />
                      <Input className="col-span-3" value={v} onChange={(e) => setManualRepos(obj => ({ ...obj, [k]: e.target.value }))} placeholder="Repository URL" />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setManualRepos(obj => ({ ...obj, '': '' }))}>Add Override</Button></div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Additional Nodes</div>
                <div className="space-y-2 max-h-48 overflow-auto border rounded p-2">
                  {extraNodes.map((n, idx) => (
                    <div key={idx} className="grid grid-cols-7 gap-2 items-center">
                      <Input className="col-span-2" placeholder="Name" value={n.name} onChange={(e) => setExtraNodes(arr => arr.map((x,i)=> i===idx? { ...x, name: e.target.value } : x))} />
                      <Input className="col-span-4" placeholder="Repository URL" value={n.repository} onChange={(e) => setExtraNodes(arr => arr.map((x,i)=> i===idx? { ...x, repository: e.target.value } : x))} />
                      <Input className="col-span-1" placeholder="Commit (optional)" value={n.commit||''} onChange={(e) => setExtraNodes(arr => arr.map((x,i)=> i===idx? { ...x, commit: e.target.value } : x))} />
                    </div>
                  ))}
                  {extraNodes.length === 0 && <div className="text-sm text-muted-foreground">No additional nodes added.</div>}
                </div>
                <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setExtraNodes(arr => [...arr, { name: '', repository: '', commit: '' }])}>Add Custom Node</Button></div>
              </div>
            </TabsContent>

            <TabsContent value="options" className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Python Version</Label>
                  <Select value={pythonVersion} onValueChange={(v) => setPythonVersion(v as '3.10'|'3.11'|'3.12'|'3.13')}>
                    <SelectTrigger><SelectValue placeholder="Python" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3.10">3.10</SelectItem>
                      <SelectItem value="3.11">3.11</SelectItem>
                      <SelectItem value="3.12">3.12</SelectItem>
                      <SelectItem value="3.13">3.13</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cache</Label>
                  <Button variant={noCache ? 'destructive' : 'outline'} className="mt-2" onClick={() => setNoCache(v => !v)}>{noCache ? 'No Cache' : 'Use Cache'}</Button>
                </div>
                <div>
                  <Label>Runtime</Label>
                  <div className="mt-2 flex gap-2">
                    <Button variant={runtimeMode==='cpu'?'default':'outline'} size="sm" onClick={()=>setRuntimeMode('cpu')}>CPU</Button>
                    <Button variant={runtimeMode==='gpu'?'default':'outline'} size="sm" onClick={()=>setRuntimeMode('gpu')}>GPU/CUDA</Button>
                  </div>
                </div>
                {runtimeMode==='gpu' && (
                  <div>
                    <Label>Safe Mode</Label>
                    <div className="mt-2 flex items-center gap-2">
                      <input id="safe-mode" type="checkbox" checked={safeMode} onChange={(e)=>setSafeMode(e.target.checked)} />
                      <label htmlFor="safe-mode" className="text-sm text-muted-foreground">Disable accelerators (fallback to plain Torch)</label>
                    </div>
                  </div>
                )}
                <div className="col-span-3 grid grid-cols-3 gap-3">
                  <div>
                    <Label>PyTorch</Label>
                    {runtimeMode==='gpu' && !safeMode && (
                      <div className="mt-1"><span className="text-xs"><span className="px-2 py-0.5 rounded border">Locked to Torch 2.8.0 + cu129 with Python {pythonVersion} for accelerators</span></span></div>
                    )}
                    <Select value={(runtimeMode==='gpu' && !safeMode) ? '2.8.0' : torchVersion} onValueChange={(v)=>setTorchVersion(v)} disabled={runtimeMode==='gpu' && !safeMode}>
                      <SelectTrigger><SelectValue placeholder="2.x" /></SelectTrigger>
                      <SelectContent>
                        {['2.8.0','2.7.1','2.7.0','2.6.0','2.5.1','2.5.0','2.4.1','2.4.0','2.3.1','2.3.0','2.2.2','2.2.1','2.2.0','2.1.2','2.1.1','2.1.0','2.0.1','2.0.0'].map(v=> (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {runtimeMode==='gpu' && (
                    <div>
                      <Label>CUDA</Label>
                      <Select value={(runtimeMode==='gpu' && !safeMode) ? 'cu129' : cudaVariant} onValueChange={(v)=>setCudaVariant(v as 'cu118'|'cu121'|'cu124'|'cu126'|'cu128'|'cu129'|'cpu')} disabled={runtimeMode==='gpu' && !safeMode}>
                        <SelectTrigger><SelectValue placeholder="cu12x" /></SelectTrigger>
                        <SelectContent>
                          {['cu118','cu121','cu124','cu126','cu128','cu129'].map(v=> (
                            <SelectItem key={v} value={v}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {runtimeMode==='gpu' && !safeMode && (
                  <div className="col-span-3 border rounded p-2">
                    <div className="flex items-center justify-between">
                      <Label>Accelerators</Label>
                      <div className="text-xs text-muted-foreground">Select precompiled accelerators</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(['xformers','triton','flash','sage','mamba'] as const).map(a => (
                        <button
                          key={a}
                          onClick={() => setAccelerators(arr => arr.includes(a) ? arr.filter(x=>x!==a) : [...arr, a])}
                          className={`px-2 py-1 border rounded text-xs ${accelerators.includes(a) ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                        >{a}</button>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input id="compile-fallback" type="checkbox" checked={compileFallback} onChange={(e)=>setCompileFallback(e.target.checked)} />
                      <label htmlFor="compile-fallback" className="text-sm text-muted-foreground">Allow compile fallback if prebuilt wheels unavailable</label>
                    </div>
                  </div>
                )}
                <div className="col-span-3 border rounded p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label>Install Nunchaku</Label>
                      <input type="checkbox" checked={installNunchaku} onChange={(e)=>setInstallNunchaku(e.target.checked)} />
                    </div>
                    <div className="text-xs text-muted-foreground">Requires PyTorch ≥ 2.5; pick matching CUDA.</div>
                  </div>
                  {installNunchaku && (
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      <div>
                        <Label>Version</Label>
                        <Input value={nunchakuVersion} onChange={(e)=>setNunchakuVersion(e.target.value)} placeholder="v0.3.1" />
                      </div>
                      <div className="col-span-2">
                        <Label>Wheel URL (optional override)</Label>
                        <Input value={nunchakuWheelUrl} onChange={(e)=>setNunchakuWheelUrl(e.target.value)} placeholder="https://github.com/.../nunchaku-...whl" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {!buildId && <div className="flex justify-end"><Button onClick={startBuild}>Start Build</Button></div>}
            </TabsContent>

            <TabsContent value="logs" className="mt-3 space-y-3">
              <BuildMonitor buildId={buildId || ''} onComplete={() => {}} />
            </TabsContent>

            <TabsContent value="verify" className="mt-3 space-y-3">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={async () => {
                  if (!buildId) return toast.error('No build to verify')
                  try {
                    const res = await apiClient.builds.verifyNodes(buildId)
                    toast[res.ok ? 'success' : 'error'](res.ok ? 'All nodes present' : `${res.missing.length} missing`)
                  } catch {
                    toast.error('Verification failed')
                  }
                }}>Run Verify</Button>
              </div>
              <div className="text-sm text-muted-foreground">Verification runs a quick container listing of custom_nodes.</div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

"use client";

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

type Primitive = string | number | boolean | null
type Params = Record<string, Primitive>
type Preset = { id: string; name: string; workflow_id: string; params: Params; created_at: string }

export function PresetsManager({ onRun }: { onRun: (opts: { workflow_id: string; params?: Params; runNow?: boolean }) => void }) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([])
  const [draft, setDraft] = useState<Preset>({ id: '', name: '', workflow_id: '', params: {}, created_at: new Date().toISOString() })
  const [jsonText, setJsonText] = useState<string>('{}')
  const [validJson, setValidJson] = useState<boolean>(true)

  // Load/save presets from localStorage
  useEffect(() => {
    try { const s = localStorage.getItem('exec.presets'); if (s) setPresets(JSON.parse(s)) } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('exec.presets', JSON.stringify(presets)) } catch {}
  }, [presets])

  // Load workflows for selection
  useEffect(() => { (async () => { try { const ws = await apiClient.workflows.list({ limit: 1000 }); setWorkflows(ws.map(w => ({ id: w.id, name: w.name }))) } catch {} })() }, [])

  // Keep JSON text in sync with draft.params
  useEffect(() => { setJsonText(JSON.stringify(draft.params, null, 2)) }, [draft.params])

  const selectedWorkflowName = useMemo(() => workflows.find(w => w.id === draft.workflow_id)?.name || '', [workflows, draft.workflow_id])

  const applyJson = () => {
    try {
      const obj = JSON.parse(jsonText || '{}') as Record<string, unknown>
      const normalized: Params = Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null ? v : String(v)])
      )
      setDraft(d => ({ ...d, params: normalized }))
      setValidJson(true)
    } catch {
      setValidJson(false)
      toast.error('Invalid JSON')
    }
  }

  const loadDefaults = async () => {
    if (!draft.workflow_id) return
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
      const res = await fetch(`${base}/api/v1/workflows/${draft.workflow_id}/openapi-config`)
      const j = await res.json() as { parameters?: { name: string; type: string; default?: Primitive }[] }
      const next: Params = {}
      for (const p of (j.parameters || [])) {
        if (p.default !== undefined) next[p.name] = p.default
        else if (p.type === 'number' || p.type === 'integer') next[p.name] = 0
        else if (p.type === 'boolean') next[p.name] = false
        else next[p.name] = ''
      }
      setDraft(d => ({ ...d, params: next }))
      toast.success('Loaded defaults from API config')
    } catch { toast.error('Failed to load defaults') }
  }

  const savePreset = () => {
    if (!draft.name || !draft.workflow_id) { toast.error('Name and workflow are required'); return }
    const id = crypto.randomUUID()
    setPresets(arr => [...arr, { ...draft, id, created_at: new Date().toISOString() }])
    setDraft({ id: '', name: '', workflow_id: draft.workflow_id, params: {}, created_at: new Date().toISOString() })
    setJsonText('{}')
    toast.success('Preset saved')
  }

  const exportPresets = () => {
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `comfy_presets_${new Date().toISOString().replace(/[:.]/g,'-')}.json`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  const importPresets = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '[]')) as Preset[]
        const cleaned = data.map(p => ({ ...p, id: p.id || crypto.randomUUID(), created_at: p.created_at || new Date().toISOString() }))
        setPresets(prev => [...prev, ...cleaned])
        toast.success(`Imported ${cleaned.length} preset(s)`)
      } catch { toast.error('Invalid presets file') }
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-3">
      <div className="border rounded p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Create Preset</div>
          <div className="text-xs text-muted-foreground">Presets are saved locally in your browser. Export to share.</div>
        </div>
        <div className="grid grid-cols-2 gap-2 items-center">
          <Input placeholder="Preset name" value={draft.name} onChange={(e)=>setDraft(d=>({ ...d, name: e.target.value }))} />
          <div className="flex items-center gap-2">
            <Label className="text-xs">Workflow</Label>
            <Select value={draft.workflow_id} onValueChange={(v)=>setDraft(d=>({ ...d, workflow_id: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select workflow" /></SelectTrigger>
              <SelectContent>
                {workflows.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 text-xs text-muted-foreground">{selectedWorkflowName ? `Selected: ${selectedWorkflowName}` : 'Choose a workflow to load default parameters.'}</div>
          <div className="col-span-2 flex items-center justify-between">
            <Label className="text-xs">Parameters (JSON)</Label>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={loadDefaults}>Load defaults</Button>
              <Button size="sm" variant="outline" onClick={applyJson}>Validate</Button>
            </div>
          </div>
          <textarea className={`col-span-2 border rounded p-2 text-xs font-mono h-32 ${validJson ? '' : 'outline outline-2 outline-red-500'}`} value={jsonText} onChange={(e)=>setJsonText(e.target.value)} />
          <div className="col-span-2 flex justify-between">
            <div className="flex items-center gap-2">
              <input id="preset-import" type="file" accept="application/json" className="hidden" onChange={(e)=>{ const f = e.target.files?.[0]; if (f) importPresets(f) }} />
              <Button size="sm" variant="outline" onClick={()=>document.getElementById('preset-import')?.click()}>Import</Button>
              <Button size="sm" variant="outline" onClick={exportPresets}>Export</Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={savePreset}>Save Preset</Button>
              <Button size="sm" variant="secondary" disabled={!draft.workflow_id} onClick={()=>onRun({ workflow_id: draft.workflow_id, params: draft.params })}>Open Form</Button>
              <Button size="sm" disabled={!draft.workflow_id} onClick={()=>onRun({ workflow_id: draft.workflow_id, params: draft.params, runNow: true })}>Run Now</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {presets.map(p => (
          <div key={p.id} className="flex items-center justify-between border rounded p-3">
            <div>
              <div className="text-sm font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">Workflow: {workflows.find(w => w.id===p.workflow_id)?.name || p.workflow_id} • Saved {new Date(p.created_at).toLocaleString()}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.keys(p.params||{}).slice(0,6).map(k => <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>)}
                {Object.keys(p.params||{}).length>6 && <Badge variant="outline" className="text-[10px]">+{Object.keys(p.params||{}).length-6}</Badge>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={()=>onRun({ workflow_id: p.workflow_id, params: p.params })}>Open Form</Button>
              <Button size="sm" onClick={()=>onRun({ workflow_id: p.workflow_id, params: p.params, runNow: true })}>Run Now</Button>
              <Button variant="outline" size="sm" onClick={()=>{ setDraft({ id:'', name: p.name, workflow_id: p.workflow_id, params: p.params, created_at: new Date().toISOString() }); setJsonText(JSON.stringify(p.params, null, 2)) }}>Edit</Button>
              <Button variant="destructive" size="sm" onClick={()=>setPresets(arr=>arr.filter(x=>x.id!==p.id))}>Delete</Button>
            </div>
          </div>
        ))}
        {presets.length === 0 && <div className="text-sm text-muted-foreground">No presets yet. Create one above by selecting a workflow and optional parameters. You can load defaults from its API config.</div>}
      </div>
    </div>
  )
}

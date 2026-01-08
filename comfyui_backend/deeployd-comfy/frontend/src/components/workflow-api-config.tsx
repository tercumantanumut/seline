"use client";

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

type Param = {
  name: string;
  type: 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
  required?: boolean;
  default?: string | number | boolean | null;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
}

export function WorkflowAPIConfig({ workflowId }: { workflowId: string }) {
  const [loading, setLoading] = useState(true)
  const [path, setPath] = useState('/generate')
  const [method, setMethod] = useState('POST')
  const [isPublic, setIsPublic] = useState(false)
  const [rateLimit, setRateLimit] = useState<number>(100)
  const [params, setParams] = useState<Param[]>([])
  const [requestSchema, setRequestSchema] = useState<Record<string, unknown>>({})
  const [responseSchema, setResponseSchema] = useState<Record<string, unknown>>({})

  useEffect(() => {
    (async () => {
      try {
        const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
        const res = await fetch(`${base}/api/v1/workflows/${workflowId}/openapi-config`)
        const j = await res.json()
        setPath(j.path || '/generate')
        setMethod(j.method || 'POST')
        setIsPublic(!!j.is_public)
        setRateLimit(j.rate_limit ?? 100)
        setParams(j.parameters || [])
        setRequestSchema(j.request_schema || {})
        setResponseSchema(j.response_schema || {})
      } catch (e) {
        console.error(e)
        toast.error('Failed to load API config')
      } finally { setLoading(false) }
    })()
  }, [workflowId])

  const save = async () => {
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')
      const res = await fetch(`${base}/api/v1/workflows/${workflowId}/openapi-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, method, is_public: isPublic, rate_limit: rateLimit, parameters: params, request_schema: requestSchema, response_schema: responseSchema })
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('API config saved')
    } catch (e) {
      toast.error('Save failed')
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading API config…</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 gap-3 items-center">
        <Label className="text-sm">Path</Label>
        <Input className="col-span-5 h-9" value={path} onChange={(e)=>setPath(e.target.value)} />
        <Label className="text-sm">Method</Label>
        <Input className="col-span-2 h-9" value={method} onChange={(e)=>setMethod(e.target.value)} />
        <Label className="text-sm">Rate Limit</Label>
        <Input className="col-span-2 h-9" type="number" value={rateLimit} onChange={(e)=>setRateLimit(parseInt(e.target.value||'0', 10))} />
        <Label className="text-sm">Public</Label>
        <div className="col-span-5 flex items-center gap-2"><Checkbox checked={isPublic} onCheckedChange={(v)=>setIsPublic(!!v)} /> <span className="text-xs text-muted-foreground">Expose in generated docs</span></div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Parameters</div>
        <div className="border rounded">
          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-3 py-2 border-b">
            <div className="col-span-3">Name</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-5">Description</div>
            <div className="col-span-1">Required</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
          <ScrollArea className="h-[280px]">
            <div className="divide-y">
              {params.map((p, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center px-3 py-2">
                  <Input className="col-span-3 h-8" value={p.name} onChange={(e)=>setParams(arr=>arr.map((x,i)=>i===idx?{...x,name:e.target.value}:x))} />
                  <Input className="col-span-2 h-8" value={p.type} onChange={(e)=>setParams(arr=>arr.map((x,i)=>i===idx?{...x,type:e.target.value}:x))} />
                  <Input className="col-span-5 h-8" placeholder="description" value={p.description||''} onChange={(e)=>setParams(arr=>arr.map((x,i)=>i===idx?{...x,description:e.target.value}:x))} />
                  <div className="col-span-1 flex items-center justify-center"><Checkbox checked={!!p.required} onCheckedChange={(v)=>setParams(arr=>arr.map((x,i)=>i===idx?{...x,required:!!v}:x))} /></div>
                  <div className="col-span-1 text-right"><Button variant="ghost" size="sm" onClick={()=>setParams(arr=>arr.filter((_,i)=>i!==idx))}>Remove</Button></div>
                </div>
              ))}
              {params.length === 0 && <div className="text-xs text-muted-foreground px-3 py-6">No parameters detected. Add parameters manually.</div>}
            </div>
          </ScrollArea>
          <div className="px-3 py-2 border-t flex justify-end"><Button variant="outline" size="sm" onClick={()=>setParams(arr=>[...arr,{name:'param',type:'string'}])}>Add Parameter</Button></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="border rounded p-2">
          <div className="text-xs text-muted-foreground mb-1">Request Schema (JSON)</div>
          <textarea className="w-full h-48 text-xs font-mono border rounded p-2" value={JSON.stringify(requestSchema, null, 2)} onChange={(e)=>{ try { setRequestSchema(JSON.parse(e.target.value||'{}')) } catch {} }} />
        </div>
        <div className="border rounded p-2">
          <div className="text-xs text-muted-foreground mb-1">Response Schema (JSON)</div>
          <textarea className="w-full h-48 text-xs font-mono border rounded p-2" value={JSON.stringify(responseSchema, null, 2)} onChange={(e)=>{ try { setResponseSchema(JSON.parse(e.target.value||'{}')) } catch {} }} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={save}>Save</Button>
      </div>
    </div>
  )
}

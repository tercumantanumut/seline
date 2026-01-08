"use client";

import { useEffect, useMemo, useState } from 'react'
import { saveRequest } from './requests-store'

type OpenAPISpec = { paths?: Record<string, Record<string, unknown>> }

function useOpenApi() {
  const [openapiUrl, setOpenapiUrl] = useState('http://localhost:8000/openapi.json')
  const [schema, setSchema] = useState<OpenAPISpec | null>(null)
  useEffect(() => { try { const s = localStorage.getItem('env.openapiUrl'); if (s) setOpenapiUrl(s) } catch {} }, [])
  useEffect(() => { try { localStorage.setItem('env.openapiUrl', openapiUrl) } catch {} }, [openapiUrl])
  useEffect(() => { (async () => { try { const res = await fetch(openapiUrl); const j = (await res.json()) as OpenAPISpec; setSchema(j) } catch { setSchema(null) } })() }, [openapiUrl])
  return { openapiUrl, setOpenapiUrl, schema }
}

export function RequestBuilder() {
  const { openapiUrl, setOpenapiUrl, schema } = useOpenApi()
  const [selected, setSelected] = useState<{ method: string; path: string } | null>(null)
  const [body, setBody] = useState<string>('{}')
  const [resp, setResp] = useState<{ status: number; text: string } | null>(null)

  const ops = useMemo(() => {
    if (!schema?.paths) return [] as { method: string; path: string; op: unknown }[]
    const out: { method: string; path: string; op: unknown }[] = []
    Object.entries(schema.paths).forEach(([path, methods]) => {
      Object.entries(methods).forEach(([method, op]) => {
        out.push({ method: method.toUpperCase(), path, op })
      })
    })
    return out
  }, [schema])

  const send = async () => {
    if (!selected) return
    setResp(null)
    try {
      const url = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + selected.path
      const init: RequestInit = { method: selected.method }
      if (selected.method !== 'GET' && selected.method !== 'DELETE') {
        init.headers = { 'Content-Type': 'application/json' }
        init.body = body
      }
      const t0 = performance.now()
      const r = await fetch(url, init)
      const t1 = performance.now()
      const text = await r.text()
      setResp({ status: r.status, text })
      saveRequest({ id: crypto.randomUUID(), method: selected.method, path: selected.path, status: r.status, latency_ms: Math.round(t1 - t0), time: new Date().toISOString(), requestBody: init.body as string, responseText: text })
    } catch (e) {
      setResp({ status: 0, text: String(e) })
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="text-xs text-muted-foreground">OpenAPI URL</div>
      <input className="border rounded px-2 py-1 text-xs w-full" value={openapiUrl} onChange={(e)=>setOpenapiUrl(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <div className="border rounded h-[60vh] overflow-auto">
          {ops.map((o, i) => (
            <button key={i} onClick={()=>{ setSelected({ method: o.method, path: o.path }); setBody('{}') }} className="w-full text-left px-2 py-1 border-b hover:bg-muted/50">
              <span className="mr-2 text-xs uppercase text-muted-foreground">{o.method}</span>
              <span className="font-mono text-xs">{o.path}</span>
            </button>
          ))}
          {ops.length === 0 && <div className="p-2 text-xs text-muted-foreground">No operations loaded.</div>}
        </div>
        <div>
          {!selected ? (
            <div className="text-xs text-muted-foreground">Select an operation to build a request.</div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs">{selected.method} <span className="font-mono">{selected.path}</span></div>
              <div className="text-xs text-muted-foreground">Body (JSON)</div>
              <textarea className="w-full h-40 border rounded p-2 font-mono text-xs" value={body} onChange={(e)=>setBody(e.target.value)} />
              <div className="flex justify-end"><button className="px-3 py-1 border rounded text-xs" onClick={send}>Send</button></div>
              {resp && (
                <div className="border rounded p-2 text-xs">
                  <div className="mb-1">Status: {resp.status}</div>
                  <pre className="whitespace-pre-wrap text-[11px]">{resp.text}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

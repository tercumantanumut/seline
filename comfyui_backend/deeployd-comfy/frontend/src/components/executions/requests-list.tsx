"use client";

import { useEffect, useState } from 'react'
import { loadRequests, SavedRequest, clearRequests } from './requests-store'
import { Button } from '@/components/ui/button'

export function RequestsList() {
  const [items, setItems] = useState<SavedRequest[]>([])
  const [active, setActive] = useState<SavedRequest | null>(null)
  const refresh = () => setItems(loadRequests())
  useEffect(() => { refresh() }, [])

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="border rounded h-[72vh] overflow-auto">
        <div className="p-2 flex items-center justify-between border-b">
          <div className="text-sm font-medium">Requests</div>
          <Button variant="outline" size="sm" onClick={()=>{ clearRequests(); refresh(); setActive(null) }}>Clear</Button>
        </div>
        {items.map((r) => (
          <button key={r.id} onClick={()=>setActive(r)} className="w-full text-left px-2 py-1 border-b hover:bg-muted/50 text-xs">
            <span className="uppercase mr-2 text-muted-foreground">{r.method}</span>
            <span className="font-mono">{r.path}</span>
            <span className="float-right">{r.status} • {r.latency_ms}ms</span>
          </button>
        ))}
        {items.length === 0 && <div className="p-2 text-xs text-muted-foreground">No requests logged.</div>}
      </div>
      <div className="border rounded h-[72vh] overflow-auto p-3 text-xs">
        {!active ? (
          <div className="text-muted-foreground">Select a request</div>
        ) : (
          <div className="space-y-2">
            <div>{active.method} <span className="font-mono">{active.path}</span> • {active.status} • {active.latency_ms}ms</div>
            <div className="text-muted-foreground">Time: {new Date(active.time).toLocaleString()}</div>
            <div className="text-muted-foreground">Request Body</div>
            <pre className="whitespace-pre-wrap">{active.requestBody || '(none)'}</pre>
            <div className="text-muted-foreground">Response</div>
            <pre className="whitespace-pre-wrap">{active.responseText || ''}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

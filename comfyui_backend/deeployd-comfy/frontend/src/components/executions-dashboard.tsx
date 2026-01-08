"use client";

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StatusPill } from '@/components/ui/status-pill'
import { ExecDrawer } from './executions/exec-drawer'
import { DocsEmbed } from './executions/docs-embed'
import { RequestBuilder } from './executions/request-builder'
import { RequestsList } from './executions/requests-list'
import { PresetsManager } from './executions/presets-manager'
import { GalleryGrid } from './executions/gallery-grid'

export function ExecutionsDashboard() {
  const [activeTab, setActiveTab] = useState('queue')
  const [search, setSearch] = useState('')
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null)
  const [runDrawer, setRunDrawer] = useState<{ workflow_id: string; params?: Record<string, string | number | boolean | null> } | null>(null)

  const { data: executions, refetch } = useQuery({
    queryKey: ['executions'],
    queryFn: () => apiClient.executions.list(200),
    refetchInterval: 4000,
  })

  const queue = useMemo(() => (executions||[]).filter(e => ['pending','running'].includes(e.status)), [executions])
  const history = useMemo(() => (executions||[]).filter(e => !['pending','running'].includes(e.status)), [executions])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Input placeholder="Search runs…" value={search} onChange={(e)=>setSearch(e.target.value)} className="w-[320px]" />
          <Badge variant="secondary">{executions?.length || 0} total</Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Queue</span><Badge variant="outline">{queue.length}</Badge>
          <span>Completed</span><Badge variant="outline">{history.filter(h => h.status==='completed').length}</Badge>
          <span>Failed</span><Badge variant="outline">{history.filter(h => h.status==='failed').length}</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="gallery">Gallery</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="docs">Docs</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-2 mt-3">
          {(queue||[]).map((e) => (
            <div key={e.id} className="flex items-center justify-between p-3 border rounded">
              <div className="flex items-center gap-3">
                <StatusPill status={e.status} />
                <div>
                  <div className="text-sm font-medium">{e.prompt_id}</div>
                  <div className="text-xs text-muted-foreground">{new Date(e.started_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={()=>setSelectedExecution(e.id)}>View</Button>
                <Button variant="destructive" size="sm" onClick={async()=>{ await apiClient.executions.cancel(e.id); refetch() }}>Cancel</Button>
              </div>
            </div>
          ))}
          {queue.length === 0 && <div className="text-sm text-muted-foreground">No pending or running executions.</div>}
        </TabsContent>

        <TabsContent value="history" className="space-y-2 mt-3">
          {(history||[]).map((e) => (
            <div key={e.id} className="flex items-center justify-between p-3 border rounded">
              <div className="flex items-center gap-3">
                <StatusPill status={e.status} />
                <div>
                  <div className="text-sm font-medium">{e.prompt_id}</div>
                  <div className="text-xs text-muted-foreground">{new Date(e.started_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={()=>setSelectedExecution(e.id)}>Details</Button>
              </div>
            </div>
          ))}
          {history.length === 0 && <div className="text-sm text-muted-foreground">No past executions.</div>}
        </TabsContent>

        <TabsContent value="gallery" className="mt-3">
          <GalleryGrid executions={executions||[]} onOpen={(id)=>setSelectedExecution(id)} />
        </TabsContent>

        <TabsContent value="presets" className="mt-3">
          <PresetsManager onRun={async ({ workflow_id, params, runNow }) => {
            if (runNow) {
              try {
                const ex = await apiClient.executions.create(workflow_id, params || {})
                setSelectedExecution(ex.id)
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error(e)
              }
            } else {
              setRunDrawer({ workflow_id, params })
            }
          }} />
        </TabsContent>

        <TabsContent value="requests" className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded h-[72vh] overflow-hidden"><DocsEmbed /></div>
            <div className="border rounded h-[72vh] overflow-auto p-3"><RequestBuilder /></div>
          </div>
          <RequestsList />
        </TabsContent>

        <TabsContent value="docs" className="mt-3">
          <div className="border rounded h-[78vh] overflow-hidden"><DocsEmbed /></div>
        </TabsContent>
      </Tabs>

      {selectedExecution && (
        <ExecDrawer executionId={selectedExecution} open onClose={()=>setSelectedExecution(null)} />
      )}

      {runDrawer && (
        <ExecDrawer workflowId={runDrawer.workflow_id} seedParams={runDrawer.params} open onClose={()=>setRunDrawer(null)} />
      )}
    </div>
  )
}

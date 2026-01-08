"use client";

type Execution = import('@/types/models').WorkflowExecution

export function GalleryGrid({ executions, onOpen }: { executions: Execution[]; onOpen: (id: string) => void }) {
  const items = executions.flatMap(e => (e.output_files||[]).map((url: string) => ({ id: e.id, url, status: e.status, started_at: e.started_at })))

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((it, i) => (
        <button key={i} onClick={()=>onOpen(it.id)} className="border rounded overflow-hidden text-left">
          {/* naive media check */}
          {/\.(png|jpg|jpeg|gif|webp)$/i.test(it.url) ? (
            <img src={it.url} alt="out" className="w-full h-36 object-cover" />
          ) : (
            <div className="w-full h-36 flex items-center justify-center text-xs text-muted-foreground">{it.url}</div>
          )}
          <div className="p-2 text-xs text-muted-foreground flex items-center justify-between">
            <span className="truncate" title={it.url}>{it.url}</span>
            <span>{new Date(it.started_at).toLocaleDateString()}</span>
          </div>
        </button>
      ))}
      {items.length === 0 && <div className="col-span-4 text-sm text-muted-foreground">No outputs yet.</div>}
    </div>
  )
}

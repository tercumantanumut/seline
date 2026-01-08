"use client";

import { useEffect, useState } from 'react'

// Very small env config stub persisted in localStorage
function useEnv() {
  const [docsUrl, setDocsUrl] = useState<string>('http://localhost:8000/docs')
  useEffect(() => {
    try {
      const saved = localStorage.getItem('env.docsUrl')
      if (saved) setDocsUrl(saved)
    } catch {}
  }, [])
  return {
    docsUrl,
    setDocsUrl: (u: string) => { try { localStorage.setItem('env.docsUrl', u) } catch {}; setDocsUrl(u) }
  }
}

export function DocsEmbed() {
  const { docsUrl, setDocsUrl } = useEnv()
  return (
    <div className="h-full w-full flex flex-col">
      <div className="p-2 border-b flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Docs URL</span>
        <input className="border rounded px-2 py-1 text-xs w-[360px]" value={docsUrl} onChange={(e)=>setDocsUrl(e.target.value)} />
        <a className="text-blue-600" href={docsUrl} target="_blank" rel="noreferrer">Open</a>
      </div>
      <iframe src={docsUrl} className="flex-1" />
    </div>
  )
}

import { Badge } from '@/components/ui/badge'

export function TypeChip({ type }: { type: string }) {
  return <Badge variant="secondary" className="text-xs">{type}</Badge>
}

export function RepoChip({ repo }: { repo: string }) {
  const short = repo.replace(/^https?:\/\//, '')
  return <Badge variant="outline" className="text-xs" title={repo}>{short}</Badge>
}

export function CommitChip({ commit }: { commit?: string }) {
  if (!commit) return null
  return <Badge variant="outline" className="text-xs">{commit.slice(0,7)}</Badge>
}

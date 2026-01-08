import { Badge, type badgeVariants } from '@/components/ui/badge'
import type { VariantProps } from "class-variance-authority"

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

type Status =
  | 'building'
  | 'success'
  | 'failed'
  | 'pending'
  | 'canceled'
  | 'running'
  | 'completed'
  | string

export function StatusPill({ status }: { status: Status }) {
  const map: Record<string, { variant: BadgeVariant; label: string }> = {
    building: { label: 'Building', variant: 'secondary' },
    running: { label: 'Running', variant: 'secondary' },
    success: { variant: 'secondary', label: 'Success' },
    completed: { variant: 'secondary', label: 'Completed' },
    failed: { variant: 'destructive', label: 'Failed' },
    pending: { variant: 'outline', label: 'Pending' },
    canceled: { variant: 'outline', label: 'Canceled' },
  }
  const cfg = map[status] ?? { variant: 'outline', label: String(status) }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

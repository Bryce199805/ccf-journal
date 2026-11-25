import { useState } from 'react'
import { Columns3, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useComparison } from '@/hooks/use-comparison'
import { JournalPicker } from './JournalPicker'
import { ComparisonSheet } from './ComparisonSheet'

export function ComparisonTray({ deviceId }: { deviceId: string }) {
  const { selected, remove } = useComparison()
  const [open, setOpen] = useState(false)
  if (!selected.length) return null
  return <Dialog open={open} onOpenChange={setOpen}>
    <aside aria-label="对比清单" className="sticky bottom-0 z-30 border-t bg-card/95 px-4 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_#0001] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 py-2 sm:flex-nowrap">
        <span aria-live="polite" className="flex items-center gap-2 text-sm font-semibold"><Columns3 className="size-4 text-primary" />期刊对比 <span className="font-normal text-muted-foreground">{selected.length} / 3</span></span>
        <ul className="order-last flex w-full min-w-0 gap-1 sm:order-none sm:flex-1">
          {selected.map(item => <li key={item.id} className="flex min-w-0 items-center rounded-full bg-muted pl-3 text-xs">
            <span title={item.name} className="truncate">{item.abbreviation || item.name}</span>
            <button className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-accent" aria-label={`移除 ${item.name}`} onClick={() => remove(item.id)}><X className="size-3.5" /></button>
          </li>)}
        </ul>
        {selected.length === 1 && <JournalPicker deviceId={deviceId} />}
        <DialogTrigger asChild><Button disabled={selected.length < 2} className="ml-auto rounded-full px-5">查看对比</Button></DialogTrigger>
      </div>
    </aside>
    <DialogContent aria-describedby={undefined} className="flex h-dvh max-h-dvh max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(88dvh,58rem)] sm:w-[94vw] sm:max-w-5xl sm:rounded-3xl">
      <div className="border-b px-5 py-4 sm:px-10 sm:py-6"><DialogTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">期刊对比</DialogTitle></div>
      <ComparisonSheet deviceId={deviceId} />
    </DialogContent>
  </Dialog>
}

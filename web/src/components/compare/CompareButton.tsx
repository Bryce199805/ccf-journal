import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { candidate, useComparison } from '@/hooks/use-comparison'
import type { EntryListItem } from '@/api/types'

export function CompareButton({ entry }: { entry: EntryListItem }) {
  const { selected, add, remove, replace } = useComparison()
  const [open, setOpen] = useState(false)
  const item = candidate(entry)
  const active = selected.some(e => e.id === item.id)
  const full = selected.length === 3 && !active
  const button = <Button size="sm" variant={active ? 'secondary' : 'ghost'} className="min-h-10 shrink-0 rounded-full px-2 text-xs text-primary"
    aria-pressed={active} aria-label={`${active ? '移出对比' : '加入对比'}：${item.name}`}
    onClick={event => {
      event.stopPropagation()
      if (active) remove(item.id)
      else if (!full) add(item)
    }}>
    {active ? <Check /> : <Plus />}{active ? '已加入' : '加入对比'}
  </Button>
  if (!full) return button
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>{button}</PopoverTrigger>
    <PopoverContent onClick={event => event.stopPropagation()}>
      <p className="mb-2 text-sm font-medium">已选满 3 本，选择要替换的期刊</p>
      {selected.map(e => <button key={e.id} className="block w-full rounded-md p-2 text-left text-sm hover:bg-muted"
        onClick={() => { replace(e.id, item); setOpen(false) }}>{e.name}</button>)}
    </PopoverContent>
  </Popover>
}

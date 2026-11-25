import { useState } from 'react'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { useEntries } from '@/hooks/use-entries'
import { useDebounce } from '@/hooks/use-debounce'
import { candidate, useComparison, type Candidate } from '@/hooks/use-comparison'
import { DEFAULT_FILTER } from '@/lib/filter-state'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { RequestError } from '@/components/shared/RequestError'

export function JournalPicker({ current, deviceId }: { current?: Candidate; deviceId: string }) {
  const [open, setOpen] = useState(false)
  const { add, replace } = useComparison()
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant={current ? 'ghost' : 'outline'} size="sm" className="min-h-9 rounded-full text-xs text-primary"
        aria-label={current ? `更换 ${current.name}` : '添加期刊'}>
        {current ? <>更换<ChevronDown /></> : <><Plus />添加期刊</>}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-80 max-w-[calc(100vw-1rem)] p-2">
      <JournalSearch deviceId={deviceId} onChoose={item => {
        if (current) replace(current.id, item)
        else add(item)
        setOpen(false)
      }} />
    </PopoverContent>
  </Popover>
}

function JournalSearch({ deviceId, onChoose }: { deviceId: string; onChoose: (item: Candidate) => void }) {
  const { selected } = useComparison()
  const [text, setText] = useState('')
  const [page, setPage] = useState(1)
  const query = useDebounce(text.trim(), 200)
  const list = useEntries({ ...DEFAULT_FILTER, query, page, perPage: 10 }, deviceId)
  const pending = list.isPlaceholderData || query !== text.trim() || list.isPending
  return <>
    <label className="flex items-center gap-2 rounded-lg bg-muted px-3">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input className="h-11 w-full bg-transparent text-sm" value={text} aria-label="搜索对比期刊" placeholder="搜索刊名、简称或 ISSN"
        onChange={event => { setText(event.target.value); setPage(1) }} />
    </label>
    <div className="max-h-[min(35dvh,18rem)] overflow-y-auto py-1">
      {list.isError ? <RequestError onRetry={() => void list.refetch()} pending={list.isFetching} /> :
        pending ? <p role="status" className="p-3 text-sm">正在搜索…</p> :
        !list.data?.data?.length ? <p className="p-3 text-sm">没有匹配的期刊</p> :
        list.data.data.map(entry => {
          const item = candidate(entry)
          const chosen = selected.some(e => e.id === item.id)
          return <button key={item.id} disabled={chosen} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:text-muted-foreground"
            onClick={() => onChoose(item)}>{item.name}{chosen && '（已加入）'}</button>
        })}
    </div>
    {(list.data?.total_pages ?? 0) > 1 && <div className="flex items-center justify-between border-t pt-1 text-xs">
      <Button variant="ghost" size="sm" disabled={pending || page === 1} onClick={() => setPage(page - 1)}>上一页</Button>
      {page} / {list.data?.total_pages}
      <Button variant="ghost" size="sm" disabled={pending || page >= list.data!.total_pages} onClick={() => setPage(page + 1)}>下一页</Button>
    </div>}
  </>
}

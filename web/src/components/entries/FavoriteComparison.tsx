import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Columns3 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RequestError } from '@/components/shared/RequestError'
import { useEntries } from '@/hooks/use-entries'
import { fetchEntryDetail } from '@/api/entries'
import { DEFAULT_FILTER } from '@/lib/filter-state'
import { ccfRelations } from '@/lib/ccf'
import { parseCAS } from '@/lib/partition'
import { wosStatusLabel } from '@/lib/wos'
import { fmt } from '@/lib/utils'
import type { Entry, EntryListItem } from '@/api/types'

function title(entry: EntryListItem) {
  return entry.ccf_full || entry.name || entry.ccf_abbr || entry.journal_abbr || '未命名期刊'
}

export function FavoriteComparison({ deviceId }: { deviceId: string }) {
  return <Dialog>
    <DialogTrigger asChild>
      <Button variant="outline" className="mb-4"><Columns3 />对比收藏期刊</Button>
    </DialogTrigger>
    <DialogContent className="flex max-h-[90dvh] flex-col gap-3 overflow-hidden p-4 sm:max-w-4xl sm:p-6">
      <DialogTitle className="pr-9">收藏期刊对比</DialogTitle>
      <ComparePicker deviceId={deviceId} />
    </DialogContent>
  </Dialog>
}

function ComparePicker({ deviceId }: { deviceId: string }) {
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<EntryListItem[]>([])
  const [comparing, setComparing] = useState(false)
  const list = useEntries({ ...DEFAULT_FILTER, favOnly: true, page }, deviceId)

  function toggle(entry: EntryListItem) {
    setSelected(previous => {
      if (previous.some(item => item.id === entry.id)) return previous.filter(item => item.id !== entry.id)
      return previous.length < 3 ? [...previous, entry] : previous
    })
  }

  if (comparing) return <>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <DialogDescription>已选 {selected.length} 本期刊</DialogDescription>
      <Button variant="outline" onClick={() => setComparing(false)}>修改选择</Button>
    </div>
    <ComparisonResults selected={selected} deviceId={deviceId} />
  </>

  const totalPages = list.data?.total_pages || 1
  return <>
    <DialogDescription>选择 2–3 本收藏期刊，可以跨页选择。</DialogDescription>
    <div className="min-h-0 overflow-y-auto rounded-lg border">
      {list.isError ? <RequestError onRetry={() => void list.refetch()} pending={list.isFetching} /> :
        list.isPending ? <p role="status" className="p-4">正在加载收藏…</p> :
        !list.data?.data?.length ? <p className="p-4 text-sm">暂无收藏期刊。</p> :
        list.data.data.map(entry => {
          const checked = selected.some(item => item.id === entry.id)
          return <label key={entry.id} className="flex min-h-11 items-center gap-3 border-b px-3 py-2 text-sm last:border-0 has-checked:bg-muted has-disabled:text-muted-foreground">
            <input type="checkbox" checked={checked} disabled={!checked && selected.length >= 3} onChange={() => toggle(entry)} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{title(entry)}</span>
          </label>
        })}
    </div>
    {(totalPages > 1 || page > 1) && <div className="flex items-center justify-center gap-3 text-sm">
      <Button size="sm" variant="outline" disabled={list.isFetching || page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
      <span>{list.data?.page || page} / {totalPages}</span>
      <Button size="sm" variant="outline" disabled={list.isFetching || page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
    </div>}
    <div className="flex items-center justify-between border-t pt-3">
      <span aria-live="polite" className="text-sm text-muted-foreground">已选 {selected.length} / 3</span>
      <Button disabled={selected.length < 2} onClick={() => setComparing(true)}>查看对比</Button>
    </div>
  </>
}

const fields: { label: string; value: (entry: Entry) => string | undefined | null }[] = [
  { label: '研究方向', value: e => e.research_area },
  { label: 'CCF 领域与等级', value: e => e.is_ccf
    ? ccfRelations(e).map(r => [r.domain, r.level].filter(Boolean).join(' · ')).join('\n')
    : e.catalog_source === 'historical_ccf' ? '历史 CCF' : 'Non-CCF' },
  { label: '中科院大类 · 2025', value: e => parseCAS(e.cas2025)?.bigZone },
  { label: '新锐大类 · 2026', value: e => parseCAS(e.xinrui)?.bigZone },
  { label: 'JCR 分区', value: e => e.wos_zone || wosStatusLabel(e.wos_status) },
  { label: '影响因子 IF', value: e => e.impact_factor == null ? null : fmt(e.impact_factor) },
  { label: '个人备注', value: e => e.note },
]

function ComparisonResults({ selected, deviceId }: { selected: EntryListItem[]; deviceId: string }) {
  const queries = useQueries({ queries: selected.map(({ id }) => ({
    queryKey: ['entry', id, deviceId],
    queryFn: () => fetchEntryDetail(id, deviceId),
  })) })
  const failed = queries.filter(query => query.isError)
  if (failed.length) return <RequestError message="期刊资料加载失败。" pending={failed.some(q => q.isFetching)}
    onRetry={() => { for (const query of failed) void query.refetch() }} />
  if (!queries.every(query => query.data)) return <p role="status">正在加载期刊资料…</p>

  const entries = queries.map((query, index) => ({ ...query.data!.entry, note: selected[index].note }))
  return <div className="min-h-0 overflow-y-auto rounded-lg border">
    <table className="w-full table-fixed text-left text-sm max-sm:block">
      <caption className="sr-only">所选期刊逐项对比</caption>
      <thead className="sticky top-0 bg-muted max-sm:sr-only"><tr>
        <th scope="col" className="w-32 p-3">对比项</th>
        {entries.map(e => <th scope="col" key={e.id} className="p-3 align-top [overflow-wrap:anywhere]">{title(e)}</th>)}
      </tr></thead>
      <tbody className="max-sm:block">{fields.map(field => <tr key={field.label} className="border-t max-sm:block">
        <th scope="row" className="bg-muted/50 px-3 py-2 align-top font-medium max-sm:block">{field.label}</th>
        {entries.map(e => <td key={e.id} className="whitespace-pre-wrap px-3 py-2 align-top [overflow-wrap:anywhere] max-sm:block">
          <span aria-hidden="true" className="mb-0.5 block text-xs font-medium text-muted-foreground sm:hidden">{title(e)}</span>
          <span>{field.value(e) || '暂无数据'}</span>
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>
}

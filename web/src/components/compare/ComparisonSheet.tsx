import { Fragment } from 'react'
import { useQueries } from '@tanstack/react-query'
import { fetchEntryDetail } from '@/api/entries'
import type { Entry } from '@/api/types'
import { useComparison } from '@/hooks/use-comparison'
import { useNotes } from '@/hooks/use-notes'
import { ccfRelations } from '@/lib/ccf'
import { parseCAS } from '@/lib/partition'
import { wosStatusLabel } from '@/lib/wos'
import { fmt } from '@/lib/utils'
import { RequestError } from '@/components/shared/RequestError'
import { JournalPicker } from './JournalPicker'

const groups: { title: string; fields: { label: string; value: (entry: Entry) => string | null | undefined }[] }[] = [
  { title: '期刊指标', fields: [
    { label: '影响因子 IF', value: e => e.impact_factor == null ? null : fmt(e.impact_factor) },
    { label: 'CiteScore', value: e => e.cite_score == null ? null : fmt(e.cite_score) },
  ] },
  { title: '目录与分区', fields: [
    { label: 'CCF 领域与等级', value: e => e.is_ccf
      ? ccfRelations(e).map(r => [r.domain, r.level].filter(Boolean).join(' · ')).join('\n')
      : e.catalog_source === 'historical_ccf' ? '历史 CCF' : 'Non-CCF' },
    { label: '中科院大类 · 2025', value: e => parseCAS(e.cas2025)?.bigZone },
    { label: '新锐大类 · 2026', value: e => parseCAS(e.xinrui)?.bigZone },
    { label: 'JCR 分区', value: e => e.wos_zone || wosStatusLabel(e.wos_status) },
  ] },
  { title: '选刊参考', fields: [
    { label: '研究方向', value: e => e.research_area },
    { label: '个人备注', value: e => e.note },
  ] },
]

export function ComparisonSheet({ deviceId }: { deviceId: string }) {
  const { selected } = useComparison()
  const notes = useNotes(deviceId)
  const queries = useQueries({ queries: selected.map(({ id }) => ({
    queryKey: ['entry', id, deviceId],
    queryFn: () => fetchEntryDetail(id, deviceId),
  })) })
  const failed = [...queries, notes].filter(query => query.isError)
  const entries = queries.flatMap(query => {
    const entry = query.data?.entry
    return entry ? [{ ...entry, note: notes.data?.get(entry.id) || '' }] : []
  })
  return <>
    <div className="flex items-center justify-between gap-2 px-5 py-2 text-sm text-muted-foreground sm:px-10">
      <span>已选 {selected.length} 本期刊</span>
      {selected.length < 3 && <JournalPicker deviceId={deviceId} />}
      {selected.length === 3 && <span className="sm:hidden">左右滑动查看</span>}
    </div>
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-8 sm:px-10" tabIndex={0} aria-label="期刊对比指标">
      <table className={`w-full table-fixed border-separate border-spacing-0 text-left ${selected.length === 3 ? 'min-w-[30rem]' : ''}`}>
        <caption className="sr-only">期刊指标、分区与选刊参考</caption>
        <thead className="sticky top-0 z-10 bg-card"><tr>
          {selected.map(item => <th key={item.id} id={`compare-journal-${item.id}`} scope="col" className="border-b border-t px-2 py-3 align-top sm:px-4">
            <span className="block truncate text-lg font-semibold tracking-tight sm:text-2xl" title={item.name}>{item.abbreviation || item.name}</span>
            {item.abbreviation && item.abbreviation !== item.name && <span className="mt-1 line-clamp-2 text-xs font-normal text-muted-foreground" title={item.name}>{item.name}</span>}
            <JournalPicker deviceId={deviceId} current={item} />
          </th>)}
        </tr></thead>
        {failed.length || entries.length !== selected.length || notes.isPending ? <tbody><tr><td colSpan={selected.length}>
          {failed.length ? <RequestError message="对比资料加载失败。" onRetry={() => { for (const query of failed) void query.refetch() }} pending={failed.some(q => q.isFetching)} /> :
            <p role="status" className="py-8 text-sm">正在加载期刊资料…</p>}
        </td></tr></tbody> : groups.map(group => <tbody key={group.title}>
          <tr><th scope="rowgroup" colSpan={selected.length} className="px-2 pb-2 pt-8 text-xl font-semibold tracking-tight sm:px-4">{group.title}</th></tr>
          {group.fields.map(field => <Fragment key={field.label}>
            <tr><th id={`compare-${field.label}`.replaceAll(' ', '-')} colSpan={selected.length} className="border-t px-2 pt-3 text-xs font-medium text-muted-foreground sm:px-4">{field.label}</th></tr>
            <tr>{entries.map(entry => {
              const value = field.value(entry)
              return <td key={entry.id} headers={`compare-journal-${entry.id} compare-${field.label.replaceAll(' ', '-')}`} className={`whitespace-pre-wrap px-2 pb-4 pt-1 align-top [overflow-wrap:anywhere] sm:px-4 ${group.title === '期刊指标' && value ? 'text-2xl font-semibold tabular-nums sm:text-3xl' : 'text-sm leading-relaxed'}`}>
                {value || '暂无数据'}
              </td>
            })}</tr>
          </Fragment>)}
        </tbody>)}
      </table>
    </div>
  </>
}

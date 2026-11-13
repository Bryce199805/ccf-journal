import { useRef, type ReactNode } from 'react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RequestError } from '@/components/shared/RequestError'
import { LevelBadge, ZoneBadge, TopBadge } from '@/components/shared/ZoneBadge'
import { CCFGrade, CCFRelations } from '@/components/shared/CCFRelations'
import { ActionButtons } from './ActionButtons'
import { BookOpen, CalendarDays, Loader2, X } from 'lucide-react'
import { useEntryDetail } from '@/hooks/use-entries'
import { fmt } from '@/lib/utils'
import { wosStatusLabel } from '@/lib/wos'
import type { Entry, CASPartition, JIFRanking, CiteScoreRanking } from '@/api/types'

function parseCAS(json: string | null): CASPartition | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch { return null }
}

function parseRows<T>(json: string | null): T[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : []
  } catch { return [] }
}

function formatDataDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
  }).format(date)
}

interface DetailDialogProps {
  entryId: number | null
  deviceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DetailDialog({ entryId, deviceId, open, onOpenChange }: DetailDialogProps) {
  const previousFocus = useRef<HTMLElement | null>(null)
  const scrollArea = useRef<HTMLDivElement>(null)
  const { data, isLoading, isError, isFetching, refetch } = useEntryDetail(entryId, deviceId)
  const entry = data?.entry

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="detail-shell flex w-[calc(100%-1rem)] max-w-none max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:w-[calc(100%-2rem)] sm:max-w-[82rem] sm:max-h-[94dvh]"
        onOpenAutoFocus={event => {
          previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          event.preventDefault()
          scrollArea.current?.focus({ preventScroll: true })
        }}
        onCloseAutoFocus={event => {
          if (previousFocus.current?.isConnected) { event.preventDefault(); previousFocus.current.focus({ preventScroll: true }) }
        }}
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-1 sm:px-6">
          <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><BookOpen className="h-4 w-4 text-primary" />{entry?.type === 'conference' ? '会议详情' : '期刊详情'}</span>
          <DialogClose asChild><Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="关闭详情"><X className="h-4 w-4" /></Button></DialogClose>
        </div>
        <div ref={scrollArea} data-detail-scroll tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain outline-none">
          {isError ? <div className="p-5"><DialogTitle className="mb-3">详情暂时无法加载</DialogTitle><RequestError message="详情加载失败，请重试。" onRetry={() => void refetch()} pending={isFetching} /></div> : isLoading || !entry ? (
            <div className="px-5 py-16 text-center"><DialogTitle className="sr-only">正在加载详情</DialogTitle><p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />正在加载详情…</p></div>
          ) : (
            <div key={entry.id} className="min-w-0 [overflow-wrap:anywhere]">
              <EntryIdentity entry={entry} />
              {entry.type === 'conference' ? <ConferenceDetail entry={entry} /> : <JournalDetail entry={entry} />}
            </div>
          )}
        </div>
        {entry && !isError && <ActionButtons letpubUrl={entry.letpub_url} officialUrl={entry.official_url} submissionUrl={entry.submission_url} ccfUrl={entry.ccf_url} ccfLabel={entry.type === 'conference' ? 'DBLP' : 'CCF'} />}
      </DialogContent>
    </Dialog>
  )
}

function EntryIdentity({ entry }: { entry: Entry }) {
  const title = entry.ccf_full || entry.name || entry.ccf_abbr || '未命名条目'
  const abbreviation = entry.ccf_abbr || entry.journal_abbr
  const publisher = entry.ccf_publisher || entry.publisher
  return (
    <header className="detail-identity px-4 pb-3 pt-3 sm:px-7 sm:pb-4 sm:pt-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {entry.type === 'conference' ? <LevelBadge level={entry.ccf_level} label={`CCF ${entry.ccf_level}`} /> : entry.is_ccf ? <CCFGrade entry={entry} /> : <Badge variant="outline" className="text-xs">{entry.catalog_source === 'historical_ccf' ? '历史 CCF' : 'Non-CCF'}</Badge>}
        {entry.type === 'journal' && parseCAS(entry.cas2025)?.isTop && <TopBadge />}
        {entry.sci_type && <Badge variant="secondary" className="text-xs">{entry.sci_type}</Badge>}
        {abbreviation && abbreviation !== title && <span className="min-w-0 text-sm font-semibold text-muted-foreground [overflow-wrap:anywhere]">{abbreviation}</span>}
      </div>
      <DialogTitle className="max-w-4xl text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{title}</DialogTitle>
      {publisher && entry.type === 'conference' && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{publisher}</p>}
      {entry.is_ccf && <div className="mt-2"><CCFRelations entry={entry} /></div>}
      {entry.is_ccf && entry.type === 'journal' && !entry.journalid && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">已收录 CCF 目录，期刊指标待补充。</p>}
    </header>
  )
}

function ConferenceDetail({ entry }: { entry: Entry }) {
  return <section className="border-t px-4 py-5 sm:px-7"><SectionHeading>会议信息</SectionHeading><dl className="detail-info mt-3"><InfoField label="领域" value={entry.ccf_domain} /><InfoField label="出版社" value={entry.ccf_publisher} /></dl></section>
}

function JournalDetail({ entry }: { entry: Entry }) {
  const cas2025 = parseCAS(entry.cas2025)
  const cas2023 = parseCAS(entry.cas2023)
  const xinrui = parseCAS(entry.xinrui)
  const jif = parseRows<JIFRanking>(entry.jif)
  const jci = parseRows<JIFRanking>(entry.jci_json)
  const citeScore = parseRows<CiteScoreRanking>(entry.citescore_rankings)
  const updated = formatDataDate(entry.last_scraped_at)
  const hasRankings = citeScore.length > 0 || jif.length > 0 || jci.length > 0
  const hasBasics = [entry.issn, entry.eissn, entry.publisher, entry.ccf_publisher, entry.country, entry.language, entry.periodicity, entry.is_oa, entry.gold_oa_ratio, entry.self_citation_rate].some(Boolean)
  return (
    <div className="detail-body min-w-0 space-y-4 border-t px-4 py-4 sm:px-7 sm:py-5">
      <JournalMetrics entry={entry} />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,16rem)] xl:gap-5">
        <section aria-label="分区对比" className="min-w-0 space-y-3">
          <SectionHeading>分区对比</SectionHeading>
          <Partition label="中科院" year="2025" data={cas2025} variant="cas" />
          <Partition label="新锐" year="2026" data={xinrui} variant="xinrui" />
          <div className="rounded-xl border bg-card px-3.5 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto font-semibold">JCR 分区</span>
              {entry.wos_zone ? <ZoneBadge zone={entry.wos_zone} variant="jcr" /> : <span className="text-xs text-muted-foreground">{wosStatusLabel(entry.wos_status) || '暂无数据'}</span>}
            </div>
            {entry.wos_reason && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{entry.wos_reason}</p>}
          </div>
          <Partition label="中科院" year="2023" data={cas2023} variant="cas" historical />
        </section>
        <section aria-label="学科排名" className="min-w-0 space-y-3">
          <SectionHeading>学科排名</SectionHeading>
          {hasRankings ? <>
            {citeScore.length > 0 && <RankingTable title="CiteScore" tone="emerald" headers={['分区', '排名', '百分位']} rows={citeScore.map(r => ({ subject: r.category || r.subject || '未标注学科', values: [r.zone || '—', r.rank || '—', r.percentile || '—'] }))} />}
            {jif.length > 0 && <RankingTable title="JIF" tone="blue" headers={['分区', '排名']} rows={jif.map(r => ({ subject: r.subject || '未标注学科', values: [r.quartile || '—', r.rank || '—'] }))} />}
            {jci.length > 0 && <RankingTable title="JCI" tone="pink" headers={['分区', '排名']} rows={jci.map(r => ({ subject: r.subject || '未标注学科', values: [r.quartile || '—', r.rank || '—'] }))} />}
          </> : <p className="rounded-xl border border-dashed bg-card px-4 py-5 text-sm text-muted-foreground">暂无学科排名数据。</p>}
          {entry.research_area && <div className="rounded-xl border bg-card px-3.5 py-3"><h4 className="text-sm font-semibold">研究方向</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{entry.research_area}</p></div>}
        </section>
        <aside className="min-w-0 space-y-4 rounded-xl border bg-card px-3.5 py-3.5 lg:col-span-2 xl:col-span-1 xl:self-start" aria-label="期刊资料">
          <div>
            <SectionHeading>期刊信息</SectionHeading>
            <dl className="detail-info mt-2 lg:grid lg:grid-cols-2 lg:gap-x-8 xl:block">
              <InfoField label="ISSN" value={entry.issn} />
              <InfoField label="eISSN" value={entry.eissn} />
              <InfoField label="出版商" value={entry.publisher || entry.ccf_publisher} />
              <InfoField label="国家/地区" value={entry.country} />
              <InfoField label="语言" value={entry.language} />
              <InfoField label="出版周期" value={entry.periodicity} />
              <InfoField label="开放获取" value={entry.is_oa} />
              <InfoField label="Gold OA" value={entry.gold_oa_ratio} />
              <InfoField label="自引率" value={entry.self_citation_rate} />
            </dl>
            {!hasBasics && <p className="mt-3 text-sm text-muted-foreground">基础资料待补充。</p>}
          </div>
          {(entry.review_speed || entry.acceptance_rate) && <div><SectionHeading>投稿参考</SectionHeading><dl className="detail-info mt-2 lg:grid lg:grid-cols-2 lg:gap-x-8 xl:block"><InfoField label="审稿速度" value={entry.review_speed} /><InfoField label="录取率" value={entry.acceptance_rate} /></dl></div>}
          {updated && <p className="flex items-start gap-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground"><CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>数据更新于 {updated}</span></p>}
        </aside>
      </div>
    </div>
  )
}

function JournalMetrics({ entry }: { entry: Entry }) {
  const primary = [
    { label: '影响因子 IF', value: entry.impact_factor, tone: 'blue' },
    { label: 'CiteScore', value: entry.cite_score, tone: 'emerald' },
    { label: 'H-index', value: entry.h_index, tone: 'violet' },
    { label: '文章数', value: entry.article_count, tone: 'orange' },
  ]
  const extra = [
    { label: '5 年影响因子', value: entry.five_year_if, tone: 'indigo' },
    { label: '实时影响因子', value: entry.realtime_if, tone: 'cyan' },
    { label: 'JCI', value: entry.jci_value, tone: 'pink' },
    { label: 'LetPub 评分', value: entry.letpub_score, tone: 'amber' },
    { label: 'SJR', value: entry.sjr, tone: 'blue' },
    { label: 'SNIP', value: entry.snip, tone: 'emerald' },
  ].filter(metric => metric.value != null)
  const hasMetrics = primary.some(metric => metric.value != null) || extra.length > 0
  if (!hasMetrics) return <section aria-label="期刊指标"><SectionHeading>期刊指标</SectionHeading><p className="mt-3 rounded-xl border border-dashed bg-card px-4 py-5 text-sm text-muted-foreground">暂无期刊指标，待数据补充后展示。</p></section>
  return <section aria-label="期刊指标" className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-end">
    <div className="min-w-0">
      <SectionHeading>期刊指标</SectionHeading>
      <dl className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {primary.map(({ label, value, tone }) => <div key={label} data-tone={tone} data-empty={value == null} className="detail-metric min-w-0 rounded-xl border px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="detail-metric-dot" aria-hidden="true" />{label}</dt>
          <dd className="mt-1.5 text-2xl font-semibold leading-none tabular-nums">{value == null ? '—' : label === 'H-index' || label === '文章数' ? String(value) : fmt(value)}</dd>
        </div>)}
      </dl>
    </div>
    {extra.length > 0 && <dl className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-3">
      {extra.map(({ label, value, tone }) => <div key={label} data-tone={tone} className="detail-metric-sm flex min-w-0 items-baseline justify-between gap-2 rounded-lg border px-3 py-2">
        <dt className="min-w-0 text-xs text-muted-foreground">{label}</dt>
        <dd className="metric-value text-sm font-semibold tabular-nums">{fmt(value!, label === 'LetPub 评分' ? 1 : 2)}</dd>
      </div>)}
    </dl>}
  </section>
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold tracking-wide">{children}</h3>
}

function Partition({ label, year, data, variant, historical }: { label: string; year: string; data: CASPartition | null; variant: 'cas' | 'xinrui'; historical?: boolean }) {
  const rows = [
    { name: '大类', category: data?.bigCategory, zone: data?.bigZone },
    { name: '小类', category: data?.smallCategory, zone: data?.smallZone },
  ]
  return <section className="detail-partition min-w-0 rounded-xl border bg-card px-3.5 py-2.5">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{label}<span className="ml-2 text-xs font-normal text-muted-foreground">{year}{historical ? ' · 历史' : ''}</span></h4>{data?.isTop && <TopBadge />}</div>
    {data ? <dl className="divide-y divide-border/60 text-sm">
      {rows.map(row => <div key={row.name} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-2 py-1.5 first:pt-0 last:pb-0">
        <dt className="pt-0.5 text-xs text-muted-foreground">{row.name}</dt>
        <dd className="min-w-0 leading-relaxed">{row.category || '暂无学科'}</dd>
        <dd>{row.zone && <ZoneBadge zone={row.zone} variant={variant} />}</dd>
      </div>)}
    </dl> : <p className="py-1 text-sm text-muted-foreground">暂无分区数据</p>}
  </section>
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 border-b border-border/60 py-1.5 text-sm leading-relaxed last:border-0 sm:text-xs"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 whitespace-pre-wrap font-medium [overflow-wrap:anywhere]">{value}</dd></div>
}

function RankingTable({ title, tone, headers, rows }: { title: string; tone: string; headers: string[]; rows: { subject: string; values: string[] }[] }) {
  return <div data-tone={tone} className="min-w-0 overflow-hidden rounded-xl border bg-card">
    <h4 className="flex items-center gap-2 border-b bg-muted/50 px-3.5 py-2 text-sm font-semibold"><span className="detail-metric-dot" aria-hidden="true" />{title} 学科排名<span className="ml-auto text-xs font-normal text-muted-foreground">{rows.length} 个学科</span></h4>
    <table className="w-full table-fixed text-left text-xs">
      <thead className="text-muted-foreground"><tr><th scope="col" className="px-3.5 py-1.5 font-normal">学科</th>{headers.map(header => <th key={header} scope="col" className="w-[4.25rem] px-2 py-1.5 font-normal last:pr-3.5">{header}</th>)}</tr></thead>
      <tbody className="divide-y divide-border/60">{rows.map((row, index) => <tr key={index} className="align-top"><th scope="row" className="px-3.5 py-2 text-sm font-medium leading-relaxed">{row.subject}</th>{row.values.map((value, i) => <td key={headers[i]} className="metric-value px-2 py-2 text-sm font-semibold tabular-nums last:pr-3.5">{value}</td>)}</tr>)}</tbody>
    </table>
  </div>
}

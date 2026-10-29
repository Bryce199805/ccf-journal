import { useRef } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { RequestError } from '@/components/shared/RequestError'
import { Badge } from '@/components/ui/badge'
import { LevelBadge, ZoneBadge, TopBadge } from '@/components/shared/ZoneBadge'
import { ActionButtons } from './ActionButtons'
import { Loader2, ExternalLink } from 'lucide-react'
import { useEntryDetail } from '@/hooks/use-entries'
import { fmt } from '@/lib/utils'
import { wosStatusLabel } from '@/lib/wos'
import { CCFGrade, CCFRelations } from '@/components/shared/CCFRelations'
import type { Entry, CASPartition, JIFRanking, CiteScoreRanking } from '@/api/types'

function parseCAS(json: string | null): CASPartition | null {
  if (!json) return null
  try { return JSON.parse(json) } catch { return null }
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
  const { data, isLoading, isError, isFetching, refetch } = useEntryDetail(entryId, deviceId)
  const entry = data?.entry as Entry | undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="detail-surface grid-cols-1 w-full max-w-[calc(100%-2rem)] sm:max-w-5xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6 gap-0"
        onOpenAutoFocus={() => { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }}
        onCloseAutoFocus={event => { if (previousFocus.current?.isConnected) { event.preventDefault(); previousFocus.current.focus() } }}
        showCloseButton={true}
        aria-describedby={undefined}
      >
        <DialogHeader className="min-w-0 pb-3 text-left">
          <DialogTitle className="text-lg font-bold leading-relaxed [overflow-wrap:anywhere] pr-9">
            {isLoading ? '加载中...' : entry?.ccf_full || entry?.name || entry?.ccf_abbr || '条目详情'}
          </DialogTitle>
        </DialogHeader>

        {isError ? <RequestError message="详情加载失败，请重试。" onRetry={() => void refetch()} pending={isFetching} /> : isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entry ? (
          entry.type === 'conference' ? (
            <ConferenceDetail entry={entry} />
          ) : (
            <JournalDetail entry={entry} />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ConferenceDetail({ entry }: { entry: Entry }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <LevelBadge level={entry.ccf_level} />
        <span className="font-semibold">{entry.ccf_abbr}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div><span className="text-muted-foreground">领域：</span>{entry.ccf_domain}</div>
        <div><span className="text-muted-foreground">出版社：</span>{entry.ccf_publisher || '-'}</div>
      </div>
      {entry.ccf_url && (
        <a href={entry.ccf_url} target="_blank" rel="noopener"
           className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
          DBLP <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  )
}

function JournalDetail({ entry }: { entry: Entry }) {
  const cas2025 = parseCAS(entry.cas2025)
  const cas2023 = parseCAS(entry.cas2023)
  const xinrui = parseCAS(entry.xinrui)
  const isTopJournal = cas2025?.isTop
  const displayName = entry.ccf_abbr || entry.journal_abbr || entry.ccf_full || entry.name || '未命名期刊'
  const displayFullName = entry.ccf_full || entry.name || ''
  const displayPublisher = entry.ccf_publisher || entry.publisher || ''

  const jifRankings = parseJIF(entry.jif)
  const jciRankings = parseJIF(entry.jci_json)
  const citeScoreRankings = parseCiteScore(entry.citescore_rankings)

  return (
    <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
      {/* Row 1: Identity + Metrics */}
      <div className="flex flex-col lg:flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {entry.is_ccf ? (
              <CCFGrade entry={entry} />
            ) : (
              <Badge variant="outline" className="h-[22px] px-2 text-xs">{entry.catalog_source === 'historical_ccf' ? '历史 CCF' : 'Non-CCF'}</Badge>
            )}
            {displayName !== displayFullName && <span className="font-bold text-lg">{displayName}</span>}
            {isTopJournal && <TopBadge />}
            {entry.wos_zone && <ZoneBadge zone={`JCR${entry.wos_zone}`} variant="jcr" />}
            {!entry.wos_zone && wosStatusLabel(entry.wos_status) && (
              <span className="text-xs text-muted-foreground" title={entry.wos_reason || undefined}>
                JCR：{wosStatusLabel(entry.wos_status)}
              </span>
            )}
            {entry.sci_type && (
              <span className="inline-flex items-center h-[20px] px-2 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                {entry.sci_type}
              </span>
            )}
          </div>
          {displayPublisher && <div className="text-xs text-muted-foreground mt-0.5">{displayPublisher}</div>}
          {entry.is_ccf && <div className="mt-2"><CCFRelations entry={entry} /></div>}
          {entry.is_ccf && !entry.journalid && <p className="text-xs text-muted-foreground mt-2">已收录 CCF 目录，期刊指标待补充</p>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto lg:shrink-0">
          <MetricCard label="IF" value={entry.impact_factor != null ? fmt(entry.impact_factor) : null} color="blue" />
          <MetricCard label="5年IF" value={entry.five_year_if != null ? fmt(entry.five_year_if) : null} color="indigo" />
          <MetricCard label="实时IF" value={entry.realtime_if != null ? fmt(entry.realtime_if) : null} color="cyan" />
          <MetricCard label="CS" value={entry.cite_score != null ? fmt(entry.cite_score) : null} color="emerald" />
          <MetricCard label="H" value={entry.h_index != null ? String(entry.h_index) : null} color="violet" />
          <MetricCard label="JCI" value={entry.jci_value != null ? fmt(entry.jci_value) : null} color="pink" />
          <MetricCard label="文章" value={entry.article_count != null ? String(entry.article_count) : null} color="orange" />
          <MetricCard label="LetPub" value={entry.letpub_score != null ? fmt(entry.letpub_score, 1) : null} color="amber" />
        </div>
      </div>

      {entry.wos_reason && <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-medium">JCR 数据说明</summary>
        <p className="mt-2 leading-relaxed text-muted-foreground">{entry.wos_reason}</p>
      </details>}

      {/* Partition table */}
      <div>
        <SectionLabel>分区对比</SectionLabel>
        <div className="space-y-3 sm:hidden">
          {([{ label: '新锐 2026', data: xinrui, variant: 'xinrui' }, { label: '中科院 2025', data: cas2025, variant: 'cas' }, { label: '中科院 2023', data: cas2023, variant: 'cas' }] as const).map(({ label, data, variant }) => (
            <section key={label} className="rounded-lg border p-3">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">{label}{data?.isTop && <TopBadge />}</h3>
              {data ? <dl className="space-y-3 text-sm">
                <div><dt className="mb-1 text-xs text-muted-foreground">大类学科 / 分区</dt><dd className="flex items-start gap-2"><span className="min-w-0 flex-1">{data.bigCategory || '暂无学科'}</span>{data.bigZone && <ZoneBadge zone={data.bigZone} variant={variant} />}</dd></div>
                <div><dt className="mb-1 text-xs text-muted-foreground">小类学科 / 分区</dt><dd className="flex items-start gap-2"><span className="min-w-0 flex-1">{data.smallCategory || '暂无学科'}</span>{data.smallZone && <ZoneBadge zone={data.smallZone} variant={variant} />}</dd></div>
              </dl> : <p className="text-sm text-muted-foreground">暂无数据</p>}
            </section>
          ))}
        </div>
        <div className="hidden min-w-0 overflow-x-auto sm:block" tabIndex={0} role="region" aria-label="分区对比表格"><table className="min-w-[36rem] w-full text-sm border-collapse border rounded-lg">
          <thead>
            <tr className="bg-muted/50">
              <th className="py-1.5 px-3 text-left font-medium text-muted-foreground w-28">版本</th>
              <th className="py-1.5 px-3 text-center font-medium text-muted-foreground w-20">大类分区</th>
              <th className="py-1.5 px-3 text-left font-medium text-muted-foreground">大类学科</th>
              <th className="py-1.5 px-3 text-center font-medium text-muted-foreground w-20">小类分区</th>
              <th className="py-1.5 px-3 text-left font-medium text-muted-foreground">小类学科</th>
              <th className="py-1.5 px-3 text-center font-medium text-muted-foreground w-14">Top</th>
            </tr>
          </thead>
          <tbody>
            <PartRow label="新锐 2026" p={xinrui} variant="xinrui" />
            <PartRow label="中科院 2025" p={cas2025} variant="cas" />
            <PartRow label="中科院 2023" p={cas2023} variant="cas" />
          </tbody>
        </table></div>
      </div>

      {/* Journal info - table layout for compactness */}
      <div>
        <SectionLabel>期刊信息</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
          <InfoField label="ISSN" value={entry.issn} />
          <InfoField label="eISSN" value={entry.eissn} />
          <InfoField label="出版商" value={entry.publisher} />
          <InfoField label="国家/地区" value={entry.country} />
          <InfoField label="语言" value={entry.language} />
          <InfoField label="出版周期" value={entry.periodicity} />
          <InfoField label="是否OA" value={entry.is_oa} />
          <InfoField label="Gold OA比例" value={entry.gold_oa_ratio} />
          <InfoField label="自引率" value={entry.self_citation_rate} />
          <InfoField label="审稿速度" value={entry.review_speed} />
          <InfoField label="录取率" value={entry.acceptance_rate} />
          <InfoField label="研究方向" value={entry.research_area} />
          <InfoField label="SJR" value={entry.sjr != null ? entry.sjr.toFixed(2) : undefined} />
          <InfoField label="SNIP" value={entry.snip != null ? entry.snip.toFixed(2) : undefined} />
          <InfoField label="数据更新时间" value={formatDataDate(entry.last_scraped_at)} />
        </div>
      </div>

      {/* Rankings - stacked, not side by side */}
      {citeScoreRankings.length > 0 && (
        <div>
          <SectionLabel>CiteScore 排名</SectionLabel>
          <RankingTable
            headers={['学科', '分区', '排名', '百分位']}
            rows={citeScoreRankings.map(r => [r.category || '-', r.zone || '-', r.rank || '-', r.percentile || '-'])}
            zones={citeScoreRankings.map(r => r.zone)}
          />
        </div>
      )}
      {jifRankings.length > 0 && (
        <div>
          <SectionLabel>JIF 学科排名</SectionLabel>
          <RankingTable
            headers={['学科', '分区', '排名']}
            rows={jifRankings.map(r => [r.subject || '-', r.quartile || '-', r.rank || '-'])}
            zones={jifRankings.map(r => r.quartile)}
          />
        </div>
      )}
      {jciRankings.length > 0 && (
        <div>
          <SectionLabel>JCI 学科排名</SectionLabel>
          <RankingTable
            headers={['学科', '分区', '排名']}
            rows={jciRankings.map(r => [r.subject || '-', r.quartile || '-', r.rank || '-'])}
            zones={jciRankings.map(r => r.quartile)}
          />
        </div>
      )}

      {/* Actions */}
      <ActionButtons
        letpubUrl={entry.letpub_url}
        officialUrl={entry.official_url}
        submissionUrl={entry.submission_url}
        ccfUrl={entry.ccf_url}
      />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="section-label text-sm font-semibold mb-3">{children}</div>
}

function MetricCard({ label, value, color }: { label: string; value: string | null; color: string }) {
  return (
    <div data-tone={color} data-empty={value == null} className="metric-tile min-w-0 px-3 py-3 text-center">
      <div className="text-lg font-semibold tabular-nums leading-snug">{value ?? '—'}</div>
      <div className="text-xs mt-1 leading-tight">{label}</div>
    </div>
  )
}

function PartRow({ label, p, variant }: { label: string; p: CASPartition | null; variant: 'cas' | 'xinrui' }) {
  return (
    <tr className="border-t">
      <td className="py-1.5 px-3 font-medium whitespace-nowrap">{label}</td>
      {!p ? (
        <td colSpan={5} className="py-1.5 px-3 text-muted-foreground">暂无数据</td>
      ) : (
        <>
          <td className="py-1.5 px-3 text-center">{p.bigZone ? <ZoneBadge zone={p.bigZone} variant={variant} /> : '-'}</td>
          <td className="py-1.5 px-3">{p.bigCategory || '-'}</td>
          <td className="py-1.5 px-3 text-center">{p.smallZone ? <ZoneBadge zone={p.smallZone} variant={variant} /> : '-'}</td>
          <td className="py-1.5 px-3 text-muted-foreground">{p.smallCategory || '-'}</td>
          <td className="py-1.5 px-3 text-center">{p.isTop ? <TopBadge /> : '-'}</td>
        </>
      )}
    </tr>
  )
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="min-w-0 flex items-baseline gap-3 text-sm leading-relaxed">
      <span className="w-24 text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 flex-1 font-medium whitespace-pre-wrap [overflow-wrap:anywhere]" title={value}>{value}</span>
    </div>
  )
}

function RankingTable({ headers, rows, zones }: { headers: string[]; rows: string[][]; zones: (string | undefined)[] }) {
  return (
    <div className="min-w-0 overflow-x-auto" tabIndex={0} role="region" aria-label="可横向滚动的数据表格">
      <table className="min-w-[24rem] w-full text-sm border-collapse border rounded-lg">
        <thead>
          <tr className="bg-muted/50">
            {headers.map((h, i) => (
              <th key={i} className="py-1.5 px-3 text-left font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t">
              {row.map((cell, ci) => (
                <td key={ci} className="py-1 px-3">
                  {ci === 1 && zones[ri] ? <ZoneBadge zone={zones[ri]!} variant="cas" /> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function parseJIF(json: string | null): JIFRanking[] {
  if (!json) return []
  try { return JSON.parse(json) } catch { return [] }
}

function parseCiteScore(json: string | null): CiteScoreRanking[] {
  if (!json) return []
  try { return JSON.parse(json) } catch { return [] }
}

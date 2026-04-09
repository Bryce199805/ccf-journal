import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { LevelBadge, ZoneBadge, TopBadge } from '@/components/shared/ZoneBadge'
import { ActionButtons } from './ActionButtons'
import { Loader2, ExternalLink } from 'lucide-react'
import { useEntryDetail } from '@/hooks/use-entries'
import { fmt } from '@/lib/utils'
import type { Entry, CASPartition, JIFRanking, CiteScoreRanking } from '@/api/types'

function parseCAS(json: string | null): CASPartition | null {
  if (!json) return null
  try { return JSON.parse(json) } catch { return null }
}

interface DetailDialogProps {
  entryId: number | null
  deviceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DetailDialog({ entryId, deviceId, open, onOpenChange }: DetailDialogProps) {
  const { data, isLoading } = useEntryDetail(entryId, deviceId)
  const entry = data?.entry as Entry | undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[60vw] w-[60vw] sm:max-w-[60vw] max-h-[92vh] overflow-y-auto p-5 gap-0"
        showCloseButton={true}
      >
        <DialogHeader className="pb-3">
          <DialogTitle className="text-lg font-bold">
            {isLoading ? '加载中...' : entry?.ccf_full || entry?.ccf_abbr || ''}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
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
      <div className="text-sm text-muted-foreground">{entry.ccf_full}</div>
      <div className="grid grid-cols-2 gap-3 text-sm">
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
  const isTopJournal = cas2025?.isTop || xinrui?.isTop

  const jifRankings = parseJIF(entry.jif)
  const citeScoreRankings = parseCiteScore(entry.citescore_rankings)

  return (
    <div className="space-y-4">
      {/* Row 1: Identity + Metrics */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <LevelBadge level={entry.ccf_level} />
            <span className="text-xs text-muted-foreground">{entry.ccf_domain}</span>
            <span className="font-bold text-lg">{entry.ccf_abbr}</span>
            {isTopJournal && <TopBadge />}
            {entry.wos_zone && <ZoneBadge zone={`JCR${entry.wos_zone}`} variant="jcr" />}
            {entry.sci_type && (
              <span className="inline-flex items-center h-[20px] px-2 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
                {entry.sci_type}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">{entry.ccf_full}</div>
          {entry.ccf_publisher && <div className="text-xs text-muted-foreground mt-0.5">{entry.ccf_publisher}</div>}
        </div>
        <div className="grid grid-cols-4 gap-2 shrink-0">
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

      {/* Partition table */}
      <div>
        <SectionLabel>分区对比</SectionLabel>
        <table className="w-full text-sm border-collapse border rounded-lg overflow-hidden">
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
        </table>
      </div>

      {/* Journal info - table layout for compactness */}
      <div>
        <SectionLabel>期刊信息</SectionLabel>
        <div className="grid grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
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
  return <div className="text-xs font-semibold text-muted-foreground mb-2">{children}</div>
}

function MetricCard({ label, value, color }: { label: string; value: string | null; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    orange: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
    cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
    pink: 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  }
  return (
    <div className={`min-w-[4.5rem] px-3 py-2.5 rounded-lg text-center ${colorMap[color] ?? 'bg-muted'}`}>
      <div className="text-sm font-bold tabular-nums leading-snug">{value ?? '—'}</div>
      <div className="text-[11px] mt-0.5 opacity-75 leading-tight">{label}</div>
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
    <div className="flex items-baseline gap-1.5 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  )
}

function RankingTable({ headers, rows, zones }: { headers: string[]; rows: string[][]; zones: (string | undefined)[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse border rounded-lg overflow-hidden">
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

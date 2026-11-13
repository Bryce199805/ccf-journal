import { Button } from '@/components/ui/button'
import { ArrowUpRight } from 'lucide-react'

interface ActionButtonsProps {
  letpubUrl: string | null
  officialUrl: string | null
  submissionUrl: string | null
  ccfUrl: string | null
  ccfLabel?: string
}

export function ActionButtons({ letpubUrl, officialUrl, submissionUrl, ccfUrl, ccfLabel = 'CCF' }: ActionButtonsProps) {
  const links = [
    { label: '官网', url: officialUrl, primary: !submissionUrl },
    { label: 'LetPub', url: letpubUrl, primary: false },
    { label: ccfLabel, url: ccfUrl, primary: false },
    { label: '投稿', url: submissionUrl, primary: true },
  ].filter(link => link.url)
  if (!links.length) return null
  return <footer className="detail-actions flex shrink-0 flex-wrap items-center gap-2 border-t bg-card px-3 py-3 sm:px-7">
    <span className="mr-auto hidden text-xs text-muted-foreground sm:block">访问相关网站</span>
    {links.map(link => <Button key={link.label} size="sm" variant={link.primary ? 'default' : 'outline'} className="h-10 min-w-0 flex-1 gap-1 px-2 text-xs sm:flex-none sm:px-3" asChild>
      <a href={link.url!} target="_blank" rel="noopener noreferrer" aria-label={`${link.label}（新窗口打开）`}>{link.label}<ArrowUpRight className="hidden h-3.5 w-3.5 sm:block" /></a>
    </Button>)}
  </footer>
}

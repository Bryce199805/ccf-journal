import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'

interface ActionButtonsProps {
  letpubUrl: string | null
  officialUrl: string | null
  submissionUrl: string | null
  ccfUrl: string | null
}

export function ActionButtons({ letpubUrl, officialUrl, submissionUrl, ccfUrl }: ActionButtonsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-3 border-t">
      {letpubUrl && (
        <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-[10.5px] h-7" asChild>
          <a href={letpubUrl} target="_blank" rel="noopener">LetPub <ExternalLink className="h-3 w-3 ml-0.5" /></a>
        </Button>
      )}
      {officialUrl && (
        <Button size="sm" variant="default" className="bg-blue-600 hover:bg-blue-700 text-[10.5px] h-7" asChild>
          <a href={officialUrl} target="_blank" rel="noopener">官网 <ExternalLink className="h-3 w-3 ml-0.5" /></a>
        </Button>
      )}
      {submissionUrl && (
        <Button size="sm" variant="default" className="bg-violet-600 hover:bg-violet-700 text-[10.5px] h-7" asChild>
          <a href={submissionUrl} target="_blank" rel="noopener">投稿 <ExternalLink className="h-3 w-3 ml-0.5" /></a>
        </Button>
      )}
      {ccfUrl && (
        <Button size="sm" variant="secondary" className="text-[10.5px] h-7" asChild>
          <a href={ccfUrl} target="_blank" rel="noopener">CCF <ExternalLink className="h-3 w-3 ml-0.5" /></a>
        </Button>
      )}
    </div>
  )
}

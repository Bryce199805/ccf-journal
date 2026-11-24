import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ShareLink({ entryId }: { entryId: number }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const url = new URL(window.location.pathname, window.location.origin)
  url.searchParams.set('entry', String(entryId))

  async function copy() {
    try {
      await navigator.clipboard.writeText(url.href)
      setStatus('copied')
    } catch {
      setStatus('manual')
    }
  }

  return <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
    {status === 'manual' && <input aria-label="手动复制详情链接" readOnly value={url.href}
      autoFocus onFocus={event => event.target.select()} className="w-32 max-w-full rounded border bg-background px-2 py-1 text-sm" />}
    <Button variant="ghost" size="sm" className="h-11" onClick={copy}>
      <Link2 /><span aria-live="polite">{status === 'copied' ? '已复制' : '复制链接'}</span>
    </Button>
  </div>
}

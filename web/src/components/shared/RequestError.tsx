import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function RequestError({ message = '加载失败，请检查网络后重试。', onRetry, pending = false }: { message?: string; onRetry: () => void; pending?: boolean }) {
  return (
    <div role="alert" className="my-3 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm">
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1">{message}</span>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={pending}>{pending ? '重试中…' : '重试'}</Button>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { useUpsertNote } from '@/hooks/use-notes'
import { Check, X, Loader2 } from 'lucide-react'

interface NoteEditorProps {
  entryId: number
  deviceId: string
  initialContent: string
  onDone?: () => void
}

export function NoteEditor({ entryId, deviceId, initialContent, onDone }: NoteEditorProps) {
  const [content, setContent] = useState(initialContent)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const saving = useRef(false)
  const upsert = useUpsertNote(deviceId)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.style.height = 'auto'
      input.style.height = `${Math.min(input.scrollHeight, 240)}px`
    }
  }, [content])

  const handleSave = () => {
    if (saving.current) return
    saving.current = true
    upsert.mutate({ entryId, content: content.trim() }, {
      onSuccess: () => onDone?.(),
      onSettled: () => { saving.current = false },
    })
  }

  return (
    <div className="mt-1.5 space-y-2" onClick={e => e.stopPropagation()}>
      <textarea
        ref={inputRef}
        aria-label="备注内容"
        value={content}
        disabled={upsert.isPending}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSave() }
          if (e.key === 'Escape') { e.stopPropagation(); if (!saving.current) onDone?.() }
        }}
        placeholder="记录研究方向、投稿计划等…"
        className="min-h-20 w-full resize-y rounded-md border bg-muted/30 px-3 py-2 text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
        maxLength={200}
      />
      {upsert.isError && <p role="alert" className="text-sm text-destructive">保存失败，内容已保留，请重试。</p>}
      <div className="flex items-center gap-2">
        <span className="mr-auto text-xs tabular-nums text-muted-foreground">{content.length}/200</span>
        <button aria-label="取消编辑备注" onClick={() => onDone?.()} disabled={upsert.isPending} className="inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-sm hover:bg-muted disabled:opacity-50"><X className="h-4 w-4" />取消</button>
        <button aria-label="保存备注" onClick={handleSave} disabled={upsert.isPending} className="inline-flex min-h-10 items-center gap-1 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50">
          {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{upsert.isPending ? '保存中' : '保存'}
        </button>
      </div>
    </div>
  )
}

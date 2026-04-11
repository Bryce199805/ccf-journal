import { useState, useRef, useEffect } from 'react'
import { useUpsertNote } from '@/hooks/use-notes'
import { cn } from '@/lib/utils'
import { Check, X, PencilLine } from 'lucide-react'

interface NoteEditorProps {
  entryId: number
  deviceId: string
  initialContent: string
}

export function NoteEditor({ entryId, deviceId, initialContent }: NoteEditorProps) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(initialContent)
  const inputRef = useRef<HTMLInputElement>(null)
  const upsert = useUpsertNote(deviceId)

  useEffect(() => {
    setContent(initialContent)
  }, [initialContent])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  const handleSave = () => {
    const trimmed = content.trim()
    upsert.mutate(
      { entryId, content: trimmed },
      {
        onSuccess: () => setEditing(false),
      },
    )
  }

  const handleCancel = () => {
    setContent(initialContent)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') handleCancel()
          }}
          placeholder="添加备注..."
          className="flex-1 h-7 text-xs bg-muted/50 border rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary"
          maxLength={200}
        />
        <button
          onClick={handleSave}
          className="p-1 rounded hover:bg-muted text-primary"
          disabled={upsert.isPending}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleCancel}
          className="p-1 rounded hover:bg-muted text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  if (!initialContent) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      >
        <PencilLine className="h-3 w-3" />
        <span>添加备注...</span>
      </button>
    )
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      className={cn(
        'flex items-start gap-1 mt-1.5 cursor-pointer group',
        'text-xs text-muted-foreground hover:text-foreground transition-colors',
      )}
    >
      <PencilLine className="h-3 w-3 mt-0.5 shrink-0 opacity-50 group-hover:opacity-100" />
      <span className="line-clamp-2">{initialContent}</span>
    </div>
  )
}

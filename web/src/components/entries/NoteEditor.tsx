import { useState, useRef, useEffect } from 'react'
import { useUpsertNote } from '@/hooks/use-notes'
import { Check, X } from 'lucide-react'

interface NoteEditorProps {
  entryId: number
  deviceId: string
  initialContent: string
  onDone?: () => void
}

export function NoteEditor({ entryId, deviceId, initialContent, onDone }: NoteEditorProps) {
  const [content, setContent] = useState(initialContent)
  const inputRef = useRef<HTMLInputElement>(null)
  const upsert = useUpsertNote(deviceId)

  useEffect(() => {
    setContent(initialContent)
  }, [initialContent])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const handleSave = () => {
    const trimmed = content.trim()
    upsert.mutate(
      { entryId, content: trimmed },
      {
        onSuccess: () => onDone?.(),
      },
    )
  }

  const handleCancel = () => {
    setContent(initialContent)
    onDone?.()
  }

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
        className="flex-1 h-6 text-xs bg-muted/50 border rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary"
        maxLength={200}
      />
      <button
        onClick={handleSave}
        className="p-0.5 rounded hover:bg-muted text-primary"
        disabled={upsert.isPending}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={handleCancel}
        className="p-0.5 rounded hover:bg-muted text-muted-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

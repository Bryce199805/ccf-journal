import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useState } from 'react'
import { TagManager } from '@/components/tags/TagManager'
import { Button } from '@/components/ui/button'
import { RequestError } from '@/components/shared/RequestError'
import { Check } from 'lucide-react'
import { TagBadge } from '@/components/tags/TagBadge'
import { useTags } from '@/hooks/use-tags'
import type { Tag } from '@/api/types'

interface TagPickerProps {
  deviceId: string
  selectedTags: string[]
  onTagsChange: (tags: string[]) => void
  pending?: boolean
  error?: boolean
  children: React.ReactNode
}

export function TagPicker({ deviceId, selectedTags, onTagsChange, pending, error, children }: TagPickerProps) {
  const { data: tags, isLoading, isError, refetch } = useTags(deviceId)
  const [open, setOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  const toggleTag = (name: string) => {
    if (selectedTags.includes(name)) {
      onTagsChange(selectedTags.filter(t => t !== name))
    } else {
      onTagsChange([...selectedTags, name])
    }
  }

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 max-w-[calc(100vw-2rem)] p-3" align="end" onClick={e => e.stopPropagation()}>
        <div className="text-xs font-medium text-muted-foreground mb-1.5">选择标签</div>
        {isError ? <RequestError onRetry={() => void refetch()} /> : isLoading ? <p role="status" className="py-2 text-sm">正在加载标签…</p> : tags && tags.length > 0 ? (
          <div className="max-h-60 space-y-0.5 overflow-y-auto">
            {tags.map((tag: Tag) => (
              <button
                key={tag.name}
                disabled={pending}
                aria-pressed={selectedTags.includes(tag.name)}
                className="flex items-center gap-2 min-h-10 w-full px-2 py-1.5 disabled:opacity-50 rounded text-xs hover:bg-muted transition-colors"
                onClick={() => toggleTag(tag.name)}
              >
                <span className="w-4 h-4 flex items-center justify-center">
                  {selectedTags.includes(tag.name) && <Check className="h-3 w-3" />}
                </span>
                <TagBadge name={tag.name} color={tag.color} />
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground py-2 text-center">暂无标签</div>
        )}
        {pending && <p role="status" className="py-2 text-xs text-muted-foreground">正在保存…</p>}
        {error && <p role="alert" className="py-2 text-xs text-destructive">标签保存失败，请重新选择。</p>}
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => { setOpen(false); setManageOpen(true) }}>新建 / 管理标签</Button>
      </PopoverContent>
    </Popover>
    <TagManager open={manageOpen} onOpenChange={setManageOpen} deviceId={deviceId} />
    </>
  )
}

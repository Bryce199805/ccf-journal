import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check } from 'lucide-react'
import { TagBadge } from '@/components/tags/TagBadge'
import { useTags } from '@/hooks/use-tags'
import type { Tag } from '@/api/types'

interface TagPickerProps {
  deviceId: string
  selectedTags: string[]
  onTagsChange: (tags: string[]) => void
  children: React.ReactNode
}

export function TagPicker({ deviceId, selectedTags, onTagsChange, children }: TagPickerProps) {
  const { data: tags } = useTags(deviceId)

  const toggleTag = (name: string) => {
    if (selectedTags.includes(name)) {
      onTagsChange(selectedTags.filter(t => t !== name))
    } else {
      onTagsChange([...selectedTags, name])
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="end" onClick={e => e.stopPropagation()}>
        <div className="text-xs font-medium text-muted-foreground mb-1.5">选择标签</div>
        {tags && tags.length > 0 ? (
          <div className="space-y-0.5">
            {tags.map((tag: Tag) => (
              <button
                key={tag.name}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors"
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
      </PopoverContent>
    </Popover>
  )
}

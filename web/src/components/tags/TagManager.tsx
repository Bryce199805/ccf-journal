import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTags, useCreateTag, useDeleteTag } from '@/hooks/use-tags'
import { TagBadge, TAG_COLORS } from './TagBadge'
import { Plus, Trash2, Loader2 } from 'lucide-react'

interface TagManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deviceId: string
}

export function TagManager({ open, onOpenChange, deviceId }: TagManagerProps) {
  const { data: tags } = useTags(deviceId)
  const createTag = useCreateTag(deviceId)
  const deleteTag = useDeleteTag()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('')

  const handleCreate = () => {
    if (!newName.trim()) return
    createTag.mutate(
      { name: newName.trim(), color: newColor },
      { onSuccess: () => { setNewName(''); setNewColor('') } },
    )
  }

  const handleDelete = (id: number) => {
    deleteTag.mutate(id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>管理标签</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {tags && tags.length > 0 && (
            <div className="space-y-1.5">
              {tags.map((tag: { id?: number; name: string; color: string }) => (
                <div key={tag.name} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted">
                  <TagBadge name={tag.name} color={tag.color} />
                  {tag.id && (
                    <button
                      onClick={() => handleDelete(tag.id!)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">新建标签</div>
            <div className="flex gap-2">
              <Input
                placeholder="标签名称"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                className="h-8 text-xs"
                maxLength={20}
              />
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || createTag.isPending}>
                {createTag.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="flex gap-1.5 mt-2">
              {TAG_COLORS.map((c) => (
                <button
                  key={c.key}
                  className={`w-5 h-5 rounded-full ${c.bg} border-2 ${newColor === c.key ? 'border-primary' : 'border-transparent'}`}
                  onClick={() => setNewColor(c.key)}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

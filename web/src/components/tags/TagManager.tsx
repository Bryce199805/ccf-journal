import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { RequestError } from '@/components/shared/RequestError'
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
  const { data: tags, isLoading, isError, refetch } = useTags(deviceId)
  const createTag = useCreateTag(deviceId)
  const deleteTag = useDeleteTag()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleCreate = () => {
    if (!newName.trim() || createTag.isPending) return
    createTag.mutate(
      { name: newName.trim(), color: newColor },
      { onSuccess: () => { setNewName(''); setNewColor(''); setErrorMsg('') }, onError: () => setErrorMsg('创建失败，请确认已登录、标签名未重复后重试。') },
    )
  }

  const handleDelete = (id: number) => {
    setErrorMsg('')
    deleteTag.mutate(id, {
      onError: () => setErrorMsg('删除失败，请重试。'),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClick={e => e.stopPropagation()} aria-describedby={undefined} className="max-w-[calc(100%-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>管理标签</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isLoading && <p role="status" className="text-sm text-muted-foreground">正在加载标签…</p>}
          {isError && <RequestError onRetry={() => void refetch()} />}
          {!isLoading && !isError && !tags?.length && <p className="text-sm text-muted-foreground">还没有标签，创建一个来整理收藏。</p>}
          {errorMsg && (
            <div role="alert" className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">{errorMsg}</div>
          )}
          {tags && tags.length > 0 && (
            <div className="space-y-1.5">
              {tags.map((tag: { id?: number; name: string; color: string }) => (
                <div key={tag.name} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted">
                  <TagBadge name={tag.name} color={tag.color} />
                  {tag.id && (
                    <button
                      aria-label={`删除标签 ${tag.name}`}
                      disabled={deleteTag.isPending}
                      onClick={() => handleDelete(tag.id!)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
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
                aria-label="新标签名称"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && handleCreate()}
                className="h-10 text-base sm:text-sm"
                maxLength={20}
              />
              <Button size="sm" aria-label="创建标签" className="h-10" onClick={handleCreate} disabled={!newName.trim() || createTag.isPending}>
                {createTag.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TAG_COLORS.map((c) => (
                <button
                  key={c.key}
                  aria-label={`标签颜色 ${c.key}`}
                  aria-pressed={newColor === c.key}
                  className={`w-8 h-8 rounded-full ${c.bg} border-2 ${newColor === c.key ? 'border-primary' : 'border-transparent'}`}
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

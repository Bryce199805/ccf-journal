import type { EntryListItem } from '@/api/types'

export function wosStatusLabel(status: EntryListItem['wos_status']): string {
  switch (status) {
    case 'not_indexed': return '未被最新 JCR 收录'
    case 'partition_unavailable': return '暂无分区'
    case 'auth_required': return '状态待更新'
    case 'source_missing': return '状态待确认'
    case 'detail_not_found': return '详情待核对'
    default: return ''
  }
}

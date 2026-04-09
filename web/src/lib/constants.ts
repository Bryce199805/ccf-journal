export const DOMAINS = [
  { key: '数据库/数据挖掘/内容检索', label: '数据库' },
  { key: '计算机图形学与多媒体', label: '图形/多媒体' },
  { key: '人工智能', label: '人工智能' },
  { key: '人机交互与普适计算', label: '人机交互' },
  { key: '交叉/综合/新兴', label: '交叉/新兴' },
] as const

export const LEVELS = [
  { key: 'A', label: 'A' },
  { key: 'B', label: 'B' },
  { key: 'C', label: 'C' },
] as const

export const ZONES = [
  { key: '1区', label: '1区' },
  { key: '2区', label: '2区' },
  { key: '3区', label: '3区' },
  { key: '4区', label: '4区' },
] as const

export const SORT_OPTIONS = [
  { value: '', label: '默认排序' },
  { value: 'impact_factor', label: '影响因子' },
  { value: 'cite_score', label: 'CiteScore' },
  { value: 'h_index', label: 'H-Index' },
  { value: 'article_count', label: '文章数' },
  { value: 'letpub_score', label: 'LetPub' },
] as const

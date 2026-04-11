import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogin: (username: string, password: string) => Promise<unknown>
  onRegister: (username: string, password: string) => Promise<unknown>
}

export function AuthDialog({ open, onOpenChange, onLogin, onRegister }: AuthDialogProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        await onLogin(username, password)
      } else {
        await onRegister(username, password)
      }
      setUsername('')
      setPassword('')
      onOpenChange(false)
    } catch {
      setError(tab === 'login' ? '用户名或密码错误' : '注册失败，用户名可能已存在')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tab === 'login' ? '登录' : '注册'}</DialogTitle>
        </DialogHeader>
        <div className="flex rounded-lg border p-0.5 bg-muted/50 mb-4">
          <button
            className={`flex-1 px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              tab === 'login' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => { setTab('login'); setError('') }}
          >
            登录
          </button>
          <button
            className={`flex-1 px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              tab === 'register' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => { setTab('register'); setError('') }}
          >
            注册
          </button>
        </div>
        <div className="space-y-3">
          <Input
            placeholder="用户名"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
          />
          <Input
            type="password"
            placeholder="密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
          />
          {error && <div className="text-xs text-destructive">{error}</div>}
          <Button className="w-full" onClick={handleSubmit} disabled={loading || !username || !password}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {tab === 'login' ? '登录' : '注册'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

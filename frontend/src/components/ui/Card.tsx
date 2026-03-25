import type { ReactNode } from 'react'
import { clsx } from 'clsx'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: boolean
}

export function Card({ children, className, padding = true }: CardProps) {
  return (
    <div className={clsx('bg-dark-surface rounded-xl border border-dark-border', padding && 'p-6', className)}>
      {children}
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  change?: number
  icon: ReactNode
  color?: string
}

export function StatCard({ title, value, change, icon, color = 'bg-primary-500' }: StatCardProps) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[#8e8e93]">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {change !== undefined && (
            <p className={clsx('text-sm mt-1', change >= 0 ? 'text-[#32d74b]' : 'text-[#ff375f]')}>
              {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% vs last month
            </p>
          )}
        </div>
        <div className={clsx('p-3 rounded-xl text-white', color)}>
          {icon}
        </div>
      </div>
    </Card>
  )
}

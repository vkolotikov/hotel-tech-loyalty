import { Headphones, HelpCircle, Megaphone, MessageCircle, MessageSquare, Quote, type LucideIcon } from 'lucide-react'
import type { WidgetForm } from './widgetForm'

/** The launcher's icons as the widget draws them (launcher_icon). */
export const LAUNCHER_ICON: Record<WidgetForm['launcher_icon'], LucideIcon> = {
  chat: MessageSquare,
  message: MessageCircle,
  support: Headphones,
  quote: Quote,
  question: HelpCircle,
  sales: Megaphone,
}

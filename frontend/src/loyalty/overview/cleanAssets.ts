import settings from './assets/clean/3f35c.svg'
import diagonal from './assets/clean/8e672.svg'
import program from './assets/clean/b8e35.svg'
import card from './assets/clean/16d8d.svg'
import help from './assets/clean/7d0b6.svg'
import members from './assets/clean/4ac06.svg'
import rewards from './assets/clean/f21d4.svg'
import points from './assets/clean/00585.svg'
import offer from './assets/clean/f8281.svg'
import reward from './assets/clean/d0163.svg'
import activityPoints from './assets/clean/1ed51.svg'
import activityLevel from './assets/clean/86440.svg'
import setupDiscounts from './assets/clean/a7249.svg'
import setupPoints from './assets/clean/8a444.svg'
import setupVisits from './assets/clean/3dbef.svg'
import setupHelp from './assets/clean/9a75d.svg'
import { overviewAssets } from './assets'
import type { ActivityItem, MetricKey } from './types'

export const cleanAssets = { settings, diagonal, program, card, help, members, rewards, points, offer, reward, activityPoints, activityLevel, setupDiscounts, setupPoints, setupVisits, setupHelp }
export const metricIcons: Record<MetricKey, string> = { members, rewards_used: rewards, points_available: points, offers_used: offer, active_offers: offer, checkins: overviewAssets.events, benefits_fulfilled: rewards, active_benefits: rewards }
export const activityIcons: Record<ActivityItem['source'], string> = { points: activityPoints, reward, visit: overviewAssets.events, member: overviewAssets.members, tier: activityLevel, benefit: overviewAssets.gift, offer }

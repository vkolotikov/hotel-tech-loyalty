import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, ClipboardList, Clock, ListChecks, Shapes, Users } from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { Page } from '../ui/Page'
import { SectionNav, type Section } from '../ui/SectionNav'
import { AccountSection } from './AccountSection'
import { DaySection } from './DaySection'
import { PlanningSection } from './PlanningSection'
import { TasksSection } from './TasksSection'
import { TemplatesSection } from './TemplatesSection'
import { TypesSection } from './TypesSection'
import { settingsTabOf, withTab, type SettingsTab } from './settingsLogic'

const PANEL = 'time-settings-panel'
const PREFIX = 'time-settings-section'

/**
 * Settings (2026-11-09): the planner's settings, shared with the full admin — the same `crm_settings` rows (through
 * the workspace's own `time/settings`) and
 * planner templates its Settings → Planner edits. Six sections (`?tab=`): the working day, who plans whose day (the
 * planning mode, 2026-11-09), task types, tasks, templates and the account's pages. Only a manager changes the settings (`manage_settings`, which mirrors the full
 * admin's menu); everyone else sees them read-only. Templates are everyone's (`manage_templates`). Every section stays
 * mounted while another is shown, so a draft survives a look at another section.
 */
export function SettingsPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const [search, setSearch] = useSearchParams()
  const tab = settingsTabOf(search.get('tab'))
  const can = boot.staff.can.manage_settings

  const sections: Section<SettingsTab>[] = [
    { key: 'day', icon: Clock, tone: 'accent', title: t('time.settings.tab.day', 'The working day'), caption: t('time.settings.caption.day', 'The venue’s hours and the standard working time') },
    { key: 'planning', icon: Users, tone: 'ai', title: t('time.settings.tab.planning', 'Who plans'), caption: t('time.settings.caption.planning', 'Everyone for the team, or each their own day') },
    { key: 'types', icon: Shapes, tone: 'progress', title: t('time.settings.tab.types', 'Task types'), caption: t('time.settings.caption.types', 'The kinds of work, with icons and colours') },
    { key: 'tasks', icon: ListChecks, tone: 'success', title: t('time.settings.tab.tasks', 'Tasks'), caption: t('time.settings.caption.tasks', 'What each type of work consists of') },
    { key: 'templates', icon: ClipboardList, tone: 'pending', title: t('time.settings.tab.templates', 'Templates'), caption: t('time.settings.caption.templates', 'Ready-made tasks to start from') },
    { key: 'account', icon: Building2, tone: 'neutral', title: t('time.settings.tab.account', 'Account'), caption: t('time.settings.caption.account', 'Team & skills, and the full admin') },
  ]

  return (
    <Page title={t('time.nav.settings', 'Settings')} line={t('time.settings.line', 'The planner’s settings, shared with the full admin’s Planner.')}>
      {!can && (
        <Notice tone="info">{t('time.settings.read_only', 'Only a manager can change the working day, who plans, the types and the tasks; you can see them here. Templates are everyone’s.')}</Notice>
      )}
      <SectionNav label={t('time.settings.sections', 'Settings sections')} idPrefix={PREFIX} panelId={PANEL} sections={sections} value={tab}
        onChange={next => setSearch(prev => withTab(prev, next), { replace: true })} />
      <div id={PANEL} role="tabpanel" aria-labelledby={`${PREFIX}-${tab}`}>
        <div hidden={tab !== 'day'}><DaySection can={can} /></div>
        <div hidden={tab !== 'planning'}><PlanningSection can={can} /></div>
        <div hidden={tab !== 'types'}><TypesSection can={can} /></div>
        <div hidden={tab !== 'tasks'}><TasksSection can={can} /></div>
        <div hidden={tab !== 'templates'}><TemplatesSection can={boot.staff.can.manage_templates} /></div>
        <div hidden={tab !== 'account'}><AccountSection /></div>
      </div>
    </Page>
  )
}

import { useTranslation } from 'react-i18next'
import { ASSIGNMENT_WORDS } from './words'
export function useAssignmentWords() {
  const { t } = useTranslation()
  return (key: keyof typeof ASSIGNMENT_WORDS) => t(`loyalty.membership.assignment.${key}`, ASSIGNMENT_WORDS[key])
}

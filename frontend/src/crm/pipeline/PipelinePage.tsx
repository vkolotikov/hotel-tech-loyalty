import { Navigate, useLocation } from 'react-router-dom'
import { pipelineTarget } from './redirect'

/**
 * `/crm/pipeline` (round 1's board and won deals): the board is the Leads area's Board view since round 2, the won
 * deals are Deals. Old links, bookmarks and Today's tiles land there.
 */
export function PipelinePage() {
  const location = useLocation()
  return <Navigate to={pipelineTarget(location.search)} replace />
}

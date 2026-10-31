/**
 * Where "Book" leads: straight into the one flow a venue has, or to a choice when it has both. A link that
 * already names a service (`?service=`) is an appointment link and skips the choice. Framework-free: the members'
 * app makes the same choice.
 */
export function bookDestination(capabilities: { services: boolean; stays: boolean }, hasServiceParam: boolean): 'appointment' | 'stay' | 'choose' | 'none' {
  const { services, stays } = capabilities
  if (services && stays) return hasServiceParam ? 'appointment' : 'choose'
  if (services) return 'appointment'
  if (stays) return 'stay'
  return 'none'
}

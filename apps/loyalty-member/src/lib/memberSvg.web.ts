import { Asset } from 'expo-asset'

const pending = new Map<string, Promise<string>>()
export function memberSvgXml(module: number): Promise<string> {
  const uri = Asset.fromModule(module).uri
  const cached = pending.get(uri)
  if (cached) return cached
  const load = fetch(uri).then(response => {
    if (!response.ok) throw new Error('Bundled SVG unavailable')
    return response.text()
  })
  pending.set(uri, load)
  void load.catch(() => { if (pending.get(uri) === load) pending.delete(uri) })
  return load
}

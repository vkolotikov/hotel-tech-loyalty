import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'

const pending = new Map<string, Promise<string>>()

/** Read the exact bundled bytes, including release Android's colonless res/raw identifiers. */
export function memberSvgXml(module: number): Promise<string> {
  const source = Asset.fromModule(module)
  const key = `${source.hash ?? ''}:${source.uri}`
  const cached = pending.get(key)
  if (cached) return cached
  const load = (async () => {
    // fromModule treats dimensioned Android resources as downloaded images. That shortcut is not a readable file.
    // A descriptor without dimensions takes Expo Asset's native resource-to-cache copy path instead.
    const asset = new Asset({ name: source.name, type: source.type, hash: source.hash, uri: source.uri })
    await asset.downloadAsync()
    if (!asset.localUri?.startsWith('file://')) throw new Error('Bundled SVG did not resolve to a local file')
    return new File(asset.localUri).text()
  })()
  pending.set(key, load)
  void load.catch(() => { if (pending.get(key) === load) pending.delete(key) })
  return load
}

import { Text, View } from 'react-native'
import { C, fonts } from '../lib/theme'
import { Glyph } from './Glyph'
import { Surface } from './ui'

/** Confirmed server receipt: still and readable, including under Reduced Motion. */
export function Done({ title, lines }: { title: string; lines: string[] }) {
  return <Surface style={{ alignItems: 'center', gap: 16, paddingVertical: 28 }}>
    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.successWash, justifyContent: 'center', alignItems: 'center' }}><Glyph name="checkmark" size={32} color={C.success} /></View>
    <Text accessibilityRole="header" style={[fonts.heading, { color: C.success, textAlign: 'center' }]}>{title}</Text>
    {lines.map((line, i) => <Text key={i} style={[fonts.body, { color: C.text2, textAlign: 'center' }]}>{line}</Text>)}
  </Surface>
}

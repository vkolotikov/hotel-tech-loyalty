import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C, fonts } from '../lib/theme'

/** The moment a write succeeded: a gold seal that settles in, the headline, and what it changed. */
export function Done({ title, lines }: { title: string; lines: string[] }) {
  const scale = useRef(new Animated.Value(0.6)).current
  const opacity = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start()
  }, [scale, opacity])
  return (
    <Animated.View style={[styles.wrap, { opacity, transform: [{ scale }] }]}>
      <View style={styles.seal}><Ionicons name="checkmark" size={44} color={C.onGold} /></View>
      <Text style={[fonts.title, { color: C.text, textAlign: 'center' }]}>{title}</Text>
      {lines.map(line => <Text key={line} style={[fonts.body, { color: C.text2, textAlign: 'center' }]}>{line}</Text>)}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  seal: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: C.gold, borderWidth: 4, borderColor: C.goldEdge },
})

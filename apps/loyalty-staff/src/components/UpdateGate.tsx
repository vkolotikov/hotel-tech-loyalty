import { useEffect, useState } from 'react'
import { AppState, Image, Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { useT } from '../lib/i18n'
import { INSTALLED_VERSION, useVersionCheck } from '../lib/appVersion'
import { updateUrl } from '../lib/version'
import { C, fonts } from '../lib/theme'
import { Backdrop, GhostButton, GoldButton } from './ui'
import appIcon from '../../assets/icon.png'

/**
 * Asks the server which versions it still serves, at start and on return to the app; below the minimum, only
 * "Update" shows, over every screen and before sign-in too.
 */
export function UpdateGate() {
  const { t } = useT()
  const state = useVersionCheck(s => s.state)
  const versions = useVersionCheck(s => s.versions)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    void useVersionCheck.getState().check(true)
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') void useVersionCheck.getState().check()
    })
    return () => subscription.remove()
  }, [])

  if (state !== 'update_required') return null
  const url = updateUrl(versions, Platform.OS)

  return (
    <View style={StyleSheet.absoluteFill}>
      <Backdrop style={styles.page}>
        <Image source={appIcon} style={styles.icon} accessibilityIgnoresInvertColors />
        <View style={{ gap: 10 }}>
          <Text style={[fonts.display, { color: C.text, textAlign: 'center' }]}>{t('update.title')}</Text>
          <Text style={[fonts.body, { color: C.text2, textAlign: 'center' }]}>{t('update.line')}</Text>
          <Text style={[fonts.small, { color: C.text3, textAlign: 'center' }]}>
            {t('update.versions', { v: INSTALLED_VERSION, min: versions?.min_version ?? '' })}
          </Text>
        </View>
        <View style={{ alignSelf: 'stretch', gap: 12 }}>
          {url
            ? <GoldButton title={t('update.now')} icon="arrow-up-circle" onPress={() => { void Linking.openURL(url) }} />
            : <Text style={[fonts.body, { color: C.goldLight, textAlign: 'center' }]}>{t('update.noLink')}</Text>}
          <GhostButton
            title={t('update.again')}
            disabled={checking}
            onPress={() => {
              setChecking(true)
              void useVersionCheck.getState().check(true).finally(() => setChecking(false))
            }}
          />
        </View>
      </Backdrop>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', justifyContent: 'center', gap: 28, padding: 32 },
  icon: { width: 96, height: 96, borderRadius: 24, borderWidth: 1, borderColor: C.goldEdge },
})

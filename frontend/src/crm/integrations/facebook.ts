/**
 * Facebook Login for connecting a Messenger page, as the full admin's MessengerConnectPanel does it: the Facebook JS SDK
 * is loaded only when a person presses Connect, initialised with the platform's public app id (the server's
 * `integrations/messenger/config`; the app secret never leaves the server), and asked for the scopes the server
 * names. The short-lived user token it hands back goes straight to the server (`list-pages`), which exchanges it.
 */

interface FacebookSdk {
  init: (options: Record<string, unknown>) => void
  login: (done: (response: { authResponse?: { accessToken?: string } | null }) => void, options: Record<string, unknown>) => void
}

/** The SDK puts itself on `window.FB` (the full admin's panel declares that global; this file only reads it). */
function sdk(): FacebookSdk | undefined {
  return (window as unknown as { FB?: FacebookSdk }).FB
}

const SDK_URL = 'https://connect.facebook.net/en_US/sdk.js'

export function loadFacebook(appId: string, version: string): Promise<FacebookSdk> {
  return new Promise((resolve, reject) => {
    const ready = () => {
      const fb = sdk()
      if (!fb) { reject(new Error('sdk_missing')); return }
      try {
        fb.init({ appId, cookie: true, xfbml: false, version })
        resolve(fb)
      } catch {
        reject(new Error('sdk_init'))
      }
    }
    if (sdk()) { ready(); return }
    const existing = document.getElementById('facebook-jssdk')
    if (existing) { existing.addEventListener('load', ready, { once: true }); existing.addEventListener('error', () => reject(new Error('sdk_load')), { once: true }); return }
    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = SDK_URL
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onload = ready
    script.onerror = () => reject(new Error('sdk_load'))
    document.head.appendChild(script)
  })
}

/** Facebook's login dialog; resolves with the short-lived user token, rejects when the person cancels. */
export function facebookLogin(fb: FacebookSdk, scopes: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    fb.login(response => {
      const token = response?.authResponse?.accessToken
      if (token) resolve(token)
      else reject(new Error('cancelled'))
    }, { scope: scopes.join(','), return_scopes: true, auth_type: 'rerequest' })
  })
}

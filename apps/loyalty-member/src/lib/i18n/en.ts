/**
 * The app's own words (`member.*`): what only the app says — signing in, joining by QR, the lock, updates, push.
 * Everything a member also reads in the portal (home, card, rewards, activity, profile, join form) comes from the
 * portal's own bundles (`portal.*`, src/lib/i18n/portalBundles.ts), so the app and the portal never disagree.
 * Every key here exists in all five languages with the same placeholders (lib.test.ts).
 */
export const en = {
  'brand': 'HexaTech Loyalty',

  'signIn.title': 'Welcome back',
  'signIn.line': 'Sign in to see your card, your points and what your membership gives you.',
  'signIn.email': 'Email',
  'signIn.password': 'Password',
  'signIn.submit': 'Sign in',
  'signIn.forgot': 'Forgot your password?',
  'signIn.new': 'New to a membership?',
  'signIn.join': 'Join with your venue’s code',
  'signIn.claim': 'Set up an existing account',

  'join.title': 'Join a membership',
  'join.line': 'Scan the QR code at your venue, or paste the sign-up link it sent you.',
  'join.scan': 'Scan the QR code',
  'join.paste': 'Paste the sign-up link',
  'join.link': 'Sign-up link',
  'join.continue': 'Continue',
  'join.badLink': 'That is not a sign-up link. Please use the link or QR code your venue gave you.',
  'join.pointCamera': 'Point the camera at the sign-up QR code',
  'join.cameraAsk': 'Allow the camera to read the QR code.',
  'join.cameraAllow': 'Allow the camera',
  'join.cameraDenied': 'The camera is not allowed. Allow it in the phone’s settings, or paste the link.',

  'home.morning': 'Good morning',
  'home.afternoon': 'Good afternoon',
  'home.evening': 'Good evening',
  'home.showCard': 'Show my card',
  'home.showCardLine': 'The QR code for the desk',
  'home.messages': 'Messages',
  'home.unread': '{{n}} new',
  'home.noneUnread': 'Nothing new',

  'tab.card': 'Card',
  'card.title': 'Your card',
  'card.show': 'Show this code at the desk',
  'card.noCode': 'Your code could not be shown. Pull down to try again.',

  'list.more': 'Show more',
  'more.title': 'More',
  'more.venue': 'Your venue',
  'more.preferences': 'Preferences',
  'more.language': 'Language',
  'more.lock': 'Lock with Face ID or fingerprint',
  'more.lockLine': 'Asks again after two minutes away',
  'more.lockMissing': 'Set up Face ID, a fingerprint or a passcode on this phone first.',
  'more.alerts': 'Notifications',
  'more.alertsLine': 'Points, offers and messages from {{venue}}',
  'more.alertsBlocked': 'Notifications for HexaTech Loyalty are switched off in the phone’s settings.',
  'more.alertsSettings': 'Open settings',
  'more.alertsUnavailable': 'Notifications work in the installed app on a phone.',
  'more.signOut': 'Sign out',
  'more.signOutAsk': 'Sign out of HexaTech Loyalty on this phone?',
  'more.version': 'Version {{v}}',

  'lock.title': 'HexaTech Loyalty is locked',
  'lock.unlock': 'Unlock',
  'lock.prompt': 'Unlock HexaTech Loyalty',

  'update.title': 'Time to update',
  'update.line': 'This version of HexaTech Loyalty is no longer supported. Update it to keep using your membership.',
  'update.versions': 'This phone has {{v}}; {{min}} or newer is needed.',
  'update.now': 'Update now',
  'update.again': 'Check again',
  'update.noLink': 'Please update HexaTech Loyalty from the App Store or Google Play.',
  'update.available': 'A newer version of HexaTech Loyalty is available.',

  'push.channel': 'Messages from your venue',

  'error.network': 'No connection. Check the internet and try again.',
  'error.invalid': 'That email and password do not match a membership.',
  'error.too_many': 'Too many tries. Please wait a minute and try again.',
  'error.not_found': 'This could not be found.',
  'error.unknown': 'Something went wrong. Please try again.',
}

export type Key = keyof typeof en

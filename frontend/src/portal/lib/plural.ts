/**
 * Phrases with a number in them that must agree with it: "1 night", "2 nights"; «1 ночь», «2 ночи», «5 ночей».
 *
 * Each family is four keys in every bundle — `<key>_one`, `<key>_few`, `<key>_many`, `<key>_other` — and i18next
 * picks one with the language's own plural rule (Intl.PluralRules): English and German use one/other, French and
 * Spanish add many (a million), Russian uses one/few/many (and other for a fraction). The five bundles keep the same
 * key set (portalLocales.test.ts), so every family carries all four forms in every language; the forms a language
 * never selects simply repeat its plural.
 *
 * The English forms below are the fallbacks, shown when a bundle is not loaded; `plural.test.ts` proves they are
 * the en bundle's own, and that no family is also left behind as a plain key.
 */
export const COUNTED = {
  'bookings.night_count': ['{{count}} night', '{{count}} nights'],
  'bookings.guest_count': ['{{count}} guest', '{{count}} guests'],
  'bookings.party': ['For {{count}} person', 'For {{count}} people'],
  'bookings.cancelled_points': ['We have taken back {{count}} point.', 'We have taken back {{count}} points.'],
  'home.lifetime': ['{{count}} earned all time', '{{count}} earned all time'],
  'home.points_to_go': ['{{count}} point to go', '{{count}} points to go'],
  'rewards.you_have': ['You have {{count}} point', 'You have {{count}} points'],
  'rewards.points_needed': ['{{count}} more point needed', '{{count}} more points needed'],
  'rewards.redeem_body': ["This spends {{count}} point. You'll get a code to show at the desk.", "This spends {{count}} points. You'll get a code to show at the desk."],
  // Release 7: a bonus-points offer's value and what claiming it added (pages/rewards/offerLabel.ts).
  'rewards.bonus_points': ['+{{count}} point', '+{{count}} points'],
  'rewards.claimed_points': ['+{{count}} point added to your balance', '+{{count}} points added to your balance'],
  'activity.entries': ['{{count}} entry', '{{count}} entries'],
  'profile.invite_stats': ['{{count}} friend joined', '{{count}} friends joined'],
  'join.with_bonus': ['Start with {{count}} point on us.', 'Start with {{count}} points on us.'],
  'book.no_days': ['No days available in the next {{count}} day.', 'No days available in the next {{count}} days.'],
  'stay.min_nights': ['The shortest stay here is {{count}} night.', 'The shortest stay here is {{count}} nights.'],
  'stay.max_nights': ['The longest stay you can book online is {{count}} night.', 'The longest stay you can book online is {{count}} nights.'],
  'stay.free_cancellation': ['Free cancellation up to {{count}} hour before arrival.', 'Free cancellation up to {{count}} hours before arrival.'],
  'stay.sleeps': ['Sleeps {{count}}', 'Sleeps {{count}}'],
} as const satisfies Record<string, readonly [string, string]>

export type CountedKey = keyof typeof COUNTED

/** The four plural suffixes every family carries in every bundle. */
export const PLURAL_FORMS = ['one', 'few', 'many', 'other'] as const

/**
 * The phrase for `count` in the member's language: `t('portal.<key>', <English plural>, { count, defaultValue_one })`.
 * Loosely typed on purpose, like paymentLabel(): i18next's TFunction has an overload set a hand-written signature
 * cannot satisfy, and this only ever uses the (key, defaultValue, options) form.
 */
export function counted(
  t: (key: string, defaultValue: string, options: Record<string, unknown>) => string,
  key: CountedKey,
  count: number,
): string {
  const [one, other] = COUNTED[key]
  return t(`portal.${key}`, other, { count, defaultValue_one: one })
}

/** A stay's length and party, each agreeing with its own number: "1 night · 2 guests". */
export function nightsAndGuests(
  t: (key: string, defaultValue: string, options: Record<string, unknown>) => string,
  nights: number,
  guests: number,
): string {
  return `${counted(t, 'bookings.night_count', nights)} · ${counted(t, 'bookings.guest_count', guests)}`
}

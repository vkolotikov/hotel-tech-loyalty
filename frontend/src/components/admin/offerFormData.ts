/**
 * Builds the multipart `FormData` an offer save posts — extracted out of
 * `Offers.tsx`'s `save()` so the tier-targeting and code-normalization rules
 * are a pure, unit-testable function rather than only reachable by clicking
 * through the form.
 */
export interface OfferFormValues {
  title: string
  description: string
  type: string
  value: string | number
  code: string
  tier_ids: number[]
  per_member_limit: string
  applies_to: string
  start_date: string
  end_date: string
  usage_limit: string
  is_featured: boolean
  is_active: boolean
}

export interface BuildOfferFormDataOptions {
  /** An existing offer is being updated (PUT), not created (POST). */
  editing: boolean
  imageFile?: File | null
}

/**
 * A saved offer's `tier_ids` as the numbers the form's checkboxes compare against. A row
 * stored as `["30"]` (before the server cast multipart ids to integers) would otherwise
 * show every tier unticked, and saving would silently clear the targeting.
 */
export function offerTierIds(raw: unknown): number[] {
  return Array.isArray(raw) ? raw.map(Number).filter(n => Number.isFinite(n)) : []
}

export function buildOfferFormData(form: OfferFormValues, opts: BuildOfferFormDataOptions): FormData {
  const formData = new FormData()
  formData.append('title', form.title)
  formData.append('description', form.description)
  formData.append('type', form.type)
  formData.append('value', String(form.value))
  // Always upper-cased and trimmed before it leaves the browser — the server
  // does the same on its own normalization pass, but the 4–24 length/charset
  // regex runs before that if this field ever skips the blur handler.
  formData.append('code', form.code ? form.code.trim().toUpperCase() : '')
  // An empty selection must still CLEAR any tiers a previous save set —
  // omitting the field entirely leaves it untouched server-side on update
  // (`tier_ids` validates as `sometimes`). Sending the bare field as '' (no
  // `[]` suffix, no entries) passes through Laravel's global
  // ConvertEmptyStringsToNull to `null`, which the `nullable|array` rule
  // accepts and which SpecialOffer stores as "no tier targeting" — proven
  // safe on both create and update by
  // OfferCodesTest::test_tier_targeting_survives_an_untouched_save_and_is_cleared_by_an_empty_one.
  // Sent unconditionally (not gated on `opts.editing`) so create and update
  // build the exact same shape for this field.
  if (form.tier_ids.length > 0) form.tier_ids.forEach(id => formData.append('tier_ids[]', String(id)))
  else formData.append('tier_ids', '')
  // Clearable-on-edit fields: only sent as an explicit '' marker when
  // editing, never as the string '0' — an empty limit means "no limit", not
  // zero. On create, an empty value is simply omitted (the column default
  // applies).
  if (form.per_member_limit) formData.append('per_member_limit', String(form.per_member_limit))
  else if (opts.editing) formData.append('per_member_limit', '')
  formData.append('applies_to', form.applies_to)
  formData.append('start_date', form.start_date)
  formData.append('end_date', form.end_date)
  // On edit, send '' when cleared so the limit actually resets to
  // unlimited (ConvertEmptyStringsToNull → null server-side).
  if (form.usage_limit) formData.append('usage_limit', String(form.usage_limit))
  else if (opts.editing) formData.append('usage_limit', '')
  formData.append('is_featured', form.is_featured ? '1' : '0')
  formData.append('is_active', form.is_active ? '1' : '0')
  if (opts.imageFile) formData.append('image', opts.imageFile)
  return formData
}

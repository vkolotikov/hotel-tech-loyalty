/** Numeric IDs in the CRM UI must remain exact when interpolated into URLs. */
export function isCrmRecordId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

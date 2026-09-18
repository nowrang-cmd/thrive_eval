const APPROVED_PAYMENT_LINK_ORIGIN = 'https://buy.stripe.com'
const APPROVED_PAYMENT_LINK_PATH = '/4gM8wP8sNcoXdz270P2400i'

export function resolveApprovedEvaluationPaymentUrl(value, registrationId) {
  if (!value || !registrationId) return null
  try {
    const url = new URL(value)
    const clientReferenceIds = url.searchParams.getAll('client_reference_id')
    const valid =
      url.origin === APPROVED_PAYMENT_LINK_ORIGIN &&
      url.pathname === APPROVED_PAYMENT_LINK_PATH &&
      !url.username &&
      !url.password &&
      !url.hash &&
      clientReferenceIds.length === 1 &&
      clientReferenceIds[0] === registrationId
    return valid ? url.toString() : null
  } catch {
    return null
  }
}

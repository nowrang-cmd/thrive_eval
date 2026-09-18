import { randomUUID } from 'node:crypto'
import { resolveApprovedEvaluationPaymentUrl } from '../src/evaluationPaymentUrl.js'

const INTAKE_PATH = '/api/public-evaluation-intake'
const MAX_BODY_BYTES = 20_000
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{16,200}$/
const COMPATIBILITY_SUNSET = new Date('2026-12-31T23:59:59.000Z')

function headerValue(request, name) {
  const headers = request?.headers || {}
  const direct = headers[name] ?? headers[name.toLowerCase()]
  if (direct !== undefined) return Array.isArray(direct) ? direct[0] : direct
  const match = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === name.toLowerCase()
  )
  const value = match?.[1]
  return Array.isArray(value) ? value[0] : value
}

function normalizedSameOrigin(request) {
  const rawOrigin = String(headerValue(request, 'origin') || '').trim()
  const rawHost = String(headerValue(request, 'host') || '').trim().toLowerCase()
  if (!rawOrigin || !rawHost || /[\s,/@]/.test(rawHost)) return ''

  try {
    const origin = new URL(rawOrigin)
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      origin.host.toLowerCase() !== rawHost
    ) {
      return ''
    }
    return origin.origin.toLowerCase()
  } catch {
    return ''
  }
}

function resolveIntakeEndpoint(env) {
  const rawEndpoint = String(
    env.THRIVE_OS_PUBLIC_EVALUATION_INTAKE_URL ||
      env.VITE_THRIVE_OS_PUBLIC_EVALUATION_INTAKE_URL ||
      ''
  ).trim()

  try {
    const endpoint = new URL(rawEndpoint)
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.pathname.replace(/\/+$/, '') !== INTAKE_PATH ||
      endpoint.search ||
      endpoint.hash
    ) {
      return null
    }
    endpoint.pathname = INTAKE_PATH
    return endpoint.toString()
  } catch {
    return null
  }
}

function responseHeaders(response, origin = '') {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Vary', 'Origin')
  response.setHeader('Deprecation', 'true')
  response.setHeader('Sunset', COMPATIBILITY_SUNSET.toUTCString())
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Idempotency-Key'
    )
    response.setHeader('Access-Control-Max-Age', '600')
  }
}

function sendJson(response, status, body, origin = '') {
  responseHeaders(response, origin)
  return response.status(status).json(body)
}

function serializedBody(request) {
  let body
  try {
    body =
      typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body ?? {})
  } catch {
    return { error: 'INVALID_JSON' }
  }

  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return { error: 'PAYLOAD_TOO_LARGE' }
  }
  return { body }
}

function copyPublicResponseHeader(upstream, response, name) {
  const value = upstream.headers?.get?.(name)
  if (value) response.setHeader(name, value)
}

async function publicResponseBody(upstream) {
  try {
    const body = await upstream.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

export function createEvaluationRegistrationForwarder({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  randomUUIDImpl = randomUUID,
} = {}) {
  return async function evaluationRegistrationForwarder(request, response) {
    const origin = normalizedSameOrigin(request)
    if (!origin) {
      return sendJson(response, 403, {
        ok: false,
        code: 'ORIGIN_NOT_ALLOWED',
        error: 'This registration origin is not allowed.',
      })
    }

    if (request.method === 'OPTIONS') {
      responseHeaders(response, origin)
      return response.status(204).end()
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST, OPTIONS')
      return sendJson(
        response,
        405,
        {
          ok: false,
          code: 'METHOD_NOT_ALLOWED',
          error: 'Method not allowed.',
        },
        origin
      )
    }

    if (Number(now()) > COMPATIBILITY_SUNSET.getTime()) {
      return sendJson(
        response,
        410,
        {
          ok: false,
          code: 'LEGACY_INTAKE_RETIRED',
          error: 'This registration page is out of date. Please refresh and try again.',
        },
        origin
      )
    }

    const endpoint = resolveIntakeEndpoint(env)
    if (!endpoint || typeof fetchImpl !== 'function') {
      return sendJson(
        response,
        503,
        {
          ok: false,
          code: 'INTAKE_UNAVAILABLE',
          error: 'Evaluation registration is temporarily unavailable.',
        },
        origin
      )
    }

    const incomingIdempotencyKey = String(
      headerValue(request, 'idempotency-key') || ''
    ).trim()
    if (
      incomingIdempotencyKey &&
      !IDEMPOTENCY_KEY_PATTERN.test(incomingIdempotencyKey)
    ) {
      return sendJson(
        response,
        400,
        {
          ok: false,
          code: 'INVALID_IDEMPOTENCY_KEY',
          error: 'The registration request is invalid.',
        },
        origin
      )
    }
    const idempotencyKey = incomingIdempotencyKey || randomUUIDImpl()

    const serialized = serializedBody(request)
    if (serialized.error) {
      const tooLarge = serialized.error === 'PAYLOAD_TOO_LARGE'
      return sendJson(
        response,
        tooLarge ? 413 : 400,
        {
          ok: false,
          code: serialized.error,
          error: tooLarge
            ? 'The request is too large.'
            : 'The request body is invalid.',
        },
        origin
      )
    }

    let upstream
    try {
      upstream = await fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          Origin: origin,
        },
        body: serialized.body,
      })
    } catch {
      return sendJson(
        response,
        503,
        {
          ok: false,
          code: 'INTAKE_UNAVAILABLE',
          error: 'Evaluation registration is temporarily unavailable.',
        },
        origin
      )
    }

    const body = await publicResponseBody(upstream)
    if (!body || upstream.status < 200 || upstream.status > 599) {
      return sendJson(
        response,
        503,
        {
          ok: false,
          code: 'INTAKE_UNAVAILABLE',
          error: 'Evaluation registration is temporarily unavailable.',
        },
        origin
      )
    }

    if (
      upstream.status >= 200 &&
      upstream.status < 300 &&
      body.paymentUrl &&
      (
        body.paymentChoice !== 'online' ||
        !resolveApprovedEvaluationPaymentUrl(
          body.paymentUrl,
          String(body.registrationId || '')
        )
      )
    ) {
      return sendJson(
        response,
        503,
        {
          ok: false,
          code: 'INTAKE_UNAVAILABLE',
          error: 'Evaluation registration is temporarily unavailable.',
        },
        origin
      )
    }

    copyPublicResponseHeader(upstream, response, 'Retry-After')
    copyPublicResponseHeader(upstream, response, 'X-RateLimit-Remaining')
    return sendJson(response, upstream.status, body, origin)
  }
}

export const evaluationRegistrationForwarderInternals = Object.freeze({
  compatibilitySunset: COMPATIBILITY_SUNSET.toISOString(),
})

export default createEvaluationRegistrationForwarder()

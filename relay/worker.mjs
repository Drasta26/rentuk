// RentUK chat relay (Cloudflare Worker). Holds the owner's Anthropic API key as a secret so app users need no key.
// It never logs or stores questions or answers. It only accepts chat requests from the RentUK app,
// fixes the model, system prompt and size limits, and rate-limits each visitor.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5-5';
const MAX_BODY_BYTES = 24 * 1024;
const MAX_TURNS = 11; // the latest question plus up to five earlier questions and answers
const MAX_ANSWER_CHARS = 8000; // each earlier answer sent back with the chat
const MAX_OUTPUT_TOKENS = 1500;
const MAX_QUESTION_CHARS = 2000;
const MAX_SUMMARY_CHARS = 1500;

const SYSTEM = `You are the assistant inside RentUK, a private app for landlords in England.
Help with renting rules, landlord safety checks, deposits, tenancies, rental income and tax, and running a let property.
Be accurate. If you are not sure, say so. For legal or tax questions give general information, name the relevant GOV.UK or HMRC page, and say it is not legal or tax advice when that matters.
Rules differ in Wales, Scotland and Northern Ireland; say so if the question may depend on it.
You are an AI. If asked, say so plainly and never claim to be a person.
Use UK English. Keep answers short (under 200 words unless asked for more). Write plain text without Markdown: short paragraphs, or simple lists that start with a hyphen.`;

function cors(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'Origin'
  };
}

function reply(status, body, origin) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...(origin ? cors(origin) : {}) } });
}

// Turns must alternate user/assistant, start and end with the user, and keep questions short.
export function checkMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_TURNS) return false;
  return messages.every((m, i) => {
    if (!m || typeof m !== 'object') return false;
    const want = i % 2 === 0 ? 'user' : 'assistant';
    if (m.role !== want) return false;
    if (m.role === 'user') return typeof m.content === 'string' && m.content.trim().length > 0 && m.content.length <= MAX_QUESTION_CHARS;
    return Array.isArray(m.content) && m.content.length <= 4 &&
      m.content.every(b => b && (b.type === 'text' || b.type === 'thinking')) &&
      JSON.stringify(m.content).length <= MAX_ANSWER_CHARS;
  }) && messages[messages.length - 1].role === 'user';
}

export default {
  async fetch(request, env) {
    const allowed = String(env.ALLOWED_ORIGINS || 'https://drasta26.github.io').split(',').map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get('origin') || '';
    const ok = allowed.includes(origin);
    if (request.method === 'OPTIONS') return ok ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
    if (!ok) return reply(403, { error: 'forbidden' });
    if (request.method !== 'POST') return reply(405, { error: 'method' }, origin);
    if (!env.ANTHROPIC_API_KEY) return reply(503, { error: 'not configured' }, origin);

    if (env.RATE_LIMITER) {
      const who = request.headers.get('cf-connecting-ip') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: who });
      if (!success) return reply(429, { error: 'slow down' }, origin);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reply(413, { error: 'too large' }, origin);
    let input;
    try { input = JSON.parse(raw); } catch (e) { return reply(400, { error: 'bad json' }, origin); }
    if (!input || !checkMessages(input.messages)) return reply(400, { error: 'bad messages' }, origin);
    const summary = typeof input.summary === 'string' ? input.summary.slice(0, MAX_SUMMARY_CHARS) : '';

    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        output_config: { effort: 'low' },
        fallbacks: 'default',
        system: summary ? SYSTEM + '\n\n' + summary : SYSTEM,
        messages: input.messages
      })
    });
    // Pass Anthropic's answer straight back; it never contains the key.
    return new Response(await upstream.text(), { status: upstream.status, headers: { 'content-type': 'application/json', ...cors(origin) } });
  }
};

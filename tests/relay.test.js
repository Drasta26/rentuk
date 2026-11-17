// Tests for the chat relay (relay/worker.mjs) with Anthropic's API replaced by a stub.
const test = require('node:test');
const assert = require('node:assert/strict');

const ORIGIN = 'https://drasta26.github.io';
const env = { ALLOWED_ORIGINS: ORIGIN, ANTHROPIC_API_KEY: 'test-key-not-real' };
const load = () => import('../relay/worker.mjs');
const post = (body, origin = ORIGIN) => new Request('https://relay.test/', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body)
});

function stubAnthropic() {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Every five years.' }] }), { status: 200 });
  };
  return calls;
}

test('relay forwards a valid question with fixed model and secret key', async () => {
  const { default: worker } = await load();
  const calls = stubAnthropic();
  const res = await worker.fetch(post({ messages: [{ role: 'user', content: 'How often is an EICR needed?' }], summary: 'Score 64' }), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, 'claude-opus-5-5');
  assert.equal(calls[0].body.max_tokens, 1500);
  assert.equal(calls[0].opts.headers['x-api-key'], 'test-key-not-real');
  assert.ok(calls[0].body.system.endsWith('Score 64'));
  assert.ok(!(await res.text()).includes('test-key-not-real'));
});

test('relay refuses other websites, other methods and missing key', async () => {
  const { default: worker } = await load();
  const calls = stubAnthropic();
  assert.equal((await worker.fetch(post({ messages: [{ role: 'user', content: 'hi' }] }, 'https://evil.example'), env)).status, 403);
  assert.equal((await worker.fetch(new Request('https://relay.test/', { method: 'GET', headers: { origin: ORIGIN } }), env)).status, 405);
  assert.equal((await worker.fetch(post({ messages: [{ role: 'user', content: 'hi' }] }), { ALLOWED_ORIGINS: ORIGIN })).status, 503);
  assert.equal(calls.length, 0);
});

test('relay rejects bad or oversized conversations', async () => {
  const { default: worker, checkMessages } = await load();
  const calls = stubAnthropic();
  assert.equal((await worker.fetch(post('not json'), env)).status, 400);
  assert.equal((await worker.fetch(post({ messages: [{ role: 'assistant', content: [] }] }), env)).status, 400);
  assert.equal((await worker.fetch(post({ messages: [{ role: 'user', content: 'x'.repeat(2001) }] }), env)).status, 400);
  assert.equal((await worker.fetch(post('x'.repeat(30000)), env)).status, 413);
  const longAnswer = [{ role: 'user', content: 'a' }, { role: 'assistant', content: [{ type: 'text', text: 'x'.repeat(9000) }] }, { role: 'user', content: 'b' }];
  assert.equal((await worker.fetch(post({ messages: longAnswer }), env)).status, 400);
  const toolBlock = [{ role: 'user', content: 'a' }, { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'x', input: {} }] }, { role: 'user', content: 'b' }];
  assert.equal((await worker.fetch(post({ messages: toolBlock }), env)).status, 400);
  const tooMany = Array.from({ length: 13 }, (_, i) => i % 2 ? { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } : { role: 'user', content: 'q' });
  assert.equal((await worker.fetch(post({ messages: tooMany }), env)).status, 400);
  assert.ok(checkMessages([{ role: 'user', content: 'a' }, { role: 'assistant', content: [] }, { role: 'user', content: 'b' }]));
  assert.ok(!checkMessages([{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }]));
  assert.equal(calls.length, 0);
});

test('relay rate-limits a busy visitor', async () => {
  const { default: worker } = await load();
  const calls = stubAnthropic();
  const limited = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await worker.fetch(post({ messages: [{ role: 'user', content: 'hi' }] }), limited)).status, 429);
  assert.equal(calls.length, 0);
});

# RentUK chat relay

Live at https://rentuk-chat.rentuk.workers.dev/ (deployed 17 Nov 2026 through the Cloudflare dashboard, with the CEO's approval). The dashboard copy is the same code with each statement on one line; request logs are off and the rate limit is set as a dashboard binding.

Lets app users chat without their own Anthropic key. The owner's key is stored as a Cloudflare secret and is never in the app, this repository or the browser.

## What it does
- Accepts chat requests only from the RentUK site (`ALLOWED_ORIGINS` in `wrangler.toml`).
- Fixes the model, the system prompt and the answer length; users cannot change them.
- Limits each question to 2,000 characters and each chat to 30 turns.
- Rate-limits each visitor to about 10 questions a minute (approximate, per Cloudflare location).
- Never logs or stores questions or answers.

The site check stops other websites, not scripts that fake the origin, so the spend limit below is the real cost control.

## Deploying again (each step needs the CEO's approval)
1. In the Anthropic Console, create a key just for RentUK and set a monthly spend limit on it.
2. Sign in to Cloudflare (Workers free plan to start; whether rate limiting is included in the free plan is not stated in Cloudflare's docs, so check).
3. From this folder: `npx wrangler deploy` (Wrangler 4.36.0 or later).
4. Add the key yourself: `npx wrangler secret put ANTHROPIC_API_KEY` and paste it when asked. Never put it in a file.
5. Put the Worker's address in `CHAT_RELAY` in `script.js`, update the privacy wording (questions pass through our relay, which never stores them), test, then push.

## Tests
`npm test` runs `tests/relay.test.js` against a stubbed Anthropic API.

# NYVEN email verification fix

## What changed

- New accounts are created as unverified and are not given a login session.
- Signup sends a six-digit numeric verification code, with a five-minute expiry.
- Login rejects correct credentials for an unverified account with `EMAIL_NOT_VERIFIED`.
- Session resolution also rejects unverified accounts as a second line of defence.
- Verification codes are stored as a hash tied to the random database row ID, not as plaintext.
- A code is single-use, permits at most five attempts, and a resend invalidates earlier verification codes.
- Added `POST /api/auth/resend-verification`, with IP/email rate limits and an anti-enumeration response.
- Signup UI now asks for password confirmation, then shows a six-digit code entry screen instead of switching directly to sign-in.
- Successful code verification returns the user to sign-in; it does not automatically sign them in.
- Email template uses the existing NYVEN wordmark, dark background, cyan/violet brand colors, and `hellovexdyn@gmail.com` support address.
- `public/nyven-wordmark.png` makes the logo available to email clients.
- Enabled the `AI` Workers AI binding in `wrangler.toml` while preserving the existing `DB` binding.

## Database / deployment notes

- No D1 migration is required. The existing `auth_email_tokens` table already has `expires_at`, `consumed_at`, and `attempts` columns.
- Keep the existing `nyven-db` D1 binding untouched.
- Configure Cloudflare Pages production and preview variables/secrets as needed:
  - `BREVO_API_KEY` (secret; required for actual email delivery)
  - `BREVO_FROM_NAME=NYVEN Support`
  - `BREVO_FROM_EMAIL=hellovexdyn@gmail.com`
  - `APP_URL=https://nyven-v1.pages.dev`
  - `ALLOWED_ORIGINS=https://nyven-v1.pages.dev`
- The sender address must be authorized/verified with Brevo. If `BREVO_API_KEY` is missing, the existing mail helper records a mock delivery and no email will actually be sent.
- Commit the source changes to the GitHub repository that deploys `nyven-v1.pages.dev`, then wait for the Cloudflare Pages deployment to finish.

## Suggested verification checklist

1. Use a fresh test email to create an account.
2. Confirm the UI stays on “Verify your email” and does not open `/chat`.
3. Confirm the email contains a six-digit code and says it expires in 5 minutes.
4. Try a wrong code, then the correct code; ensure the wrong code is rejected and the correct code succeeds once.
5. Request a resend and confirm the old code no longer works.
6. Try signing in before verification; it must be blocked.
7. Verify the email and then sign in; it should work normally.
8. Check the email outbox / Brevo delivery logs if the email does not arrive.

## Validation performed

- Auth token and email template tests: 9 passed.
- TypeScript transpile/syntax checks passed for the edited TypeScript/TSX files.
- A full frontend build could not be run in this environment because dependency installation timed out; run the normal Cloudflare Pages build after committing.

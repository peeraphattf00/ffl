# FC Friends League

Thai mobile-friendly FC27 Ultimate Team league app. Profiles are shared across seasons. Competitions choose existing profiles and single or double round robin fixtures. Only recorded scores contribute to standings; 0–0 is a recorded draw. Archived competitions retain history but do not count in standings.

## Data and editing

D1 stores versioned league state, immutable score history within that state, member accounts, password hashes, expiring sessions, and login rate limits. Updates use an atomic compare-and-swap on the version: concurrent editors must refresh rather than overwrite each other. Undo restores the previous score only within 30 seconds and only when that match has not subsequently changed. Historical restore is explicit and appends a new event. Profile IDs stay stable when names and badges change.

R2 stores cropped badges. The app accepts PNG/JPEG/WebP, crops to 512×512, verifies file signatures server-side, and limits stored files to 2 MB. Profiles can be deactivated without deleting history. Programs with recorded history lock their participants, season, and format.

## Authentication

The Site audience is public (decided 2026-10-05, FFL-4): anonymous visitors can read league data and badges (`GET /api/league`, `GET /api/badge`), while every write (`POST /api/league`, `POST /api/badge`) requires an editing session. The audience itself is a Site setting changed by the owner, not app code. The Site owner is identified by the ChatGPT identity header, which is only present after signing in with ChatGPT; on a public Site the owner must use the in-app "เข้าสู่ระบบเจ้าของ" link (`/signin-with-chatgpt`) before owner-only actions such as creating the first admin. ChatGPT sign-in is separate from member accounts.

Editing uses member accounts (`users`): one account per league profile, role `admin` or `member` (permissions below). The verified owner creates the first admin once (`POST /api/auth` `bootstrap`, refused once any admin exists). Admins create accounts, reset passwords, disable/enable accounts and change roles (`/api/users`); new and reset accounts get a 12-character temporary password shown once, stored only as a hash, and must replace it before any other request succeeds. Changing a password revokes the account's other sessions; resetting or disabling revokes all of them. The last enabled admin cannot be disabled or demoted. Passwords are PBKDF2 SHA-256 hashes compared in constant time; sessions are HTTP-only, same-site cookies expiring after 12 hours, and `sessions.user_id` binds them to an account. Sign-in errors do not reveal whether a username exists, and only failures are rate limited: 5 per username and address and 20 per address per 15 minutes. Score history records the editor's profile id in `History.by`.

The shared editing password used before accounts has been retired (migration `0002_retire_shared_password` deletes the `settings.password` row, sessions without `user_id` and their rate-limit rows; the API no longer has `login`/`setup` on `/api/league` and rejects any session without an account). History events it recorded keep `by: 'legacy'` and show as แก้ด้วยรหัสกลาง.

### Permissions

| Action | Admin | Member |
| --- | --- | --- |
| Edit name, team and badge of **their own** profile (`profile`) | ✅ | ✅ |
| Edit other profiles, turn a profile on/off (`active`), add a player | ✅ | ❌ |
| Create or edit seasons (`season`) | ✅ | ❌ |
| Create or edit competitions (`competition`), archive or restore them (`archive`) | ✅ | ❌ |
| Record, edit or clear any result, Undo, restore from history (`score`, `restore`) — **every match**, played in or not | ✅ | ✅ |
| Upload a badge image (`POST /api/badge`) | ✅ | ✅ (can only be set on their own profile) |
| Manage accounts (`/api/users`) | ✅ | ❌ |
| Change their own password | ✅ | ✅ |

The rules live in one place, `lib/permissions.ts` (`can(me, action, target)`, a pure function returning a Thai reason when refused). `POST /api/league` calls it after `requireEditor()` and before the version check and `saveState`, so a refusal is a 403 that leaves the version unchanged; the role is read from the database on every request, so a demoted admin loses admin actions on their next request. The UI uses the same `can()` to hide buttons (signed-out visitors still see them and are asked to sign in) and, on a 403, shows the reason, closes the dialog and reloads. Account management keeps its own `requireAdmin()` check in `/api/users`. Uploaded badges are not tied to a profile, so the profile save is what is enforced; unused uploads stay in R2 as before.

When changing a rule, update `lib/permissions.ts` together with its tests: the unit table in `scripts/test-permissions.mjs` and the API checks in `scripts/test-members.mjs` (step "members edit only their own profile…" and the role-change step).

## Migrations, backup and rollback

Schema changes are additive only: new tables, new nullable columns and new indexes. No migration may drop, rebuild or rewrite an existing table, and none may modify the `league` row. `drizzle/` is copied into the build output (`dist/.openai/drizzle`) for the platform to apply on deploy.

- **Backup before every deploy that adds a migration:** `npm run db:backup` (read-only `GET /api/league` on the public Site plus every badge it references) writes `backups/<timestamp>/` containing `league.json`, the badge files and `manifest.json` with SHA-256 hashes. `backups/` is ignored by Git. A full D1 export would need direct Cloudflare access to the Site's database, which ChatGPT Sites does not expose here.
- **Check the migration against that backup:** `npm run test:migration -- backups/<timestamp>/league.json` (no argument uses synthetic data). It builds a throwaway local D1 under `.wrangler/migration-test`, applies `0000`, loads the league row with a legacy password, session and rate-limit row, applies the remaining migrations, and fails unless those rows are byte-identical and standings for every season, results, history and badges are unchanged. It never touches `.wrangler/state`.
- **Code rollback:** redeploy the previous commit. Added tables and columns are ignored by older code, which still inserts sessions without `user_id`. The league JSON is rewritten whole, so fields added later (such as `History.by`) are preserved.
- **Data restore:** `league.json` holds the exact `state` and `version`. There is no restore endpoint; writing it back needs either platform access to the Site's D1 or a temporary owner-only restore action. Badges can be re-uploaded from `backups/<timestamp>/badges/` through the profile editor.
- **After the shared password is removed:** rolling code back to a shared-password release shows first-time setup again, and the verified owner sets a new shared password.

## LINE notifications

After a `score` action saves a non-empty result (new or edited), the server pushes a text summary (program, match, score, previous score if edited, who recorded it from `History.by`, top 4) to one LINE group via the Messaging API. Clearing, Undo and restore do not notify yet. The push runs after `requireEditor()`, `can()` and `saveState`, uses a 5-second timeout and `X-Line-Retry-Key` = event id, and never fails the save; the response carries `line: off | sent | failed` and the UI warns on `failed`.

Secrets (Site environment secrets in production; locally in `.dev.vars`, see `.dev.vars.example`, git-ignored and not copied into `dist/`):
- `LINE_CHANNEL_TOKEN` — LINE Developers Console → channel → Messaging API → Channel access token (long-lived) → Issue
- `LINE_CHANNEL_SECRET` — Basic settings → Channel secret (webhook signature only)
- `LINE_GROUP_ID` — target group (`C…`)

Notifications are off when the token or group id is unset (as in `npm test`, whose server reads env files next to `dist/server/wrangler.json` only). Enable "Allow bot to join group chats" and disable auto-reply in OA Manager.

Getting the group id once: run `npm run dev` with the secret in `.dev.vars`, expose it with `cloudflared tunnel --url http://localhost:5173 --http-host-header localhost:5173`, set the Messaging API webhook URL to `<tunnel>/api/line/webhook`, invite the bot to the group (or post in it), and read `LINE join groupId: C…` from the dev log. The webhook only verifies `X-Line-Signature` and logs; turn the webhook off afterwards.

Quota: a push to a group counts one message per group member against the OA's monthly allowance.

## Verification

- `npm test` runs the league, LINE message, permission, migration, member-account and league API tests; it builds first and needs no running dev server
- `node node_modules/typescript/bin/tsc --noEmit`
- `node scripts/test-league.mjs`
- `node scripts/test-line.mjs` (message text, push with a fake fetch, webhook signature; never calls LINE)
- `node scripts/test-permissions.mjs` (permission table, no server)
- `node scripts/test-members.mjs` (after a build; `scripts/test-server.mjs` starts `wrangler dev` on a throwaway D1 in `.wrangler/test-server`, port 8791 or `TEST_PORT`)
- `node scripts/test-migration.mjs` (optionally with a `backups/<timestamp>/league.json`)
- `node scripts/test-api.mjs` (after a build; same harness on port 8792 or `TEST_PORT`)
- `node scripts/run-framework.mjs build`

Local database files and R2 test uploads are ignored and never included in deployment. Production starts with KEVIN, Dioxzyp, YEPPO, EKAI and Season 01, without match results.

Tie-breaks: points, goal difference, goals scored, then head-to-head points among the still-tied group. Remaining ties use names only for stable display.

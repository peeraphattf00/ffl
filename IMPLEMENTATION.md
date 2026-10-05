# FC Friends League

Thai mobile-friendly FC27 Ultimate Team league app. Profiles are shared across seasons. Competitions choose existing profiles and single or double round robin fixtures. Only recorded scores contribute to standings; 0–0 is a recorded draw. Archived competitions retain history but do not count in standings.

## Data and editing

D1 stores versioned league state, immutable score history within that state, member accounts, password hashes, expiring sessions, and login rate limits. Updates use an atomic compare-and-swap on the version: concurrent editors must refresh rather than overwrite each other. Undo restores the previous score only within 30 seconds and only when that match has not subsequently changed. Historical restore is explicit and appends a new event. Profile IDs stay stable when names and badges change.

R2 stores cropped badges. The app accepts PNG/JPEG/WebP, crops to 512×512, verifies file signatures server-side, and limits stored files to 2 MB. Profiles can be deactivated without deleting history. Programs with recorded history lock their participants, season, and format.

## Authentication

The Site audience is public (decided 2026-10-05, FFL-4): anonymous visitors can read league data and badges (`GET /api/league`, `GET /api/badge`), while every write (`POST /api/league`, `POST /api/badge`) requires an editing session. The audience itself is a Site setting changed by the owner, not app code. The Site owner is identified by the ChatGPT identity header, which is only present after signing in with ChatGPT; on a public Site the owner must use the in-app "เข้าสู่ระบบเจ้าของ" link (`/signin-with-chatgpt`) before owner-only actions such as creating the first admin. ChatGPT sign-in is separate from member accounts.

Editing uses member accounts (`users`): one account per league profile, role `admin` or `member`. Members can edit all league data; admins can also manage accounts. The verified owner creates the first admin once (`POST /api/auth` `bootstrap`, refused once any admin exists). Admins create accounts, reset passwords, disable/enable accounts and change roles (`/api/users`); new and reset accounts get a 12-character temporary password shown once, stored only as a hash, and must replace it before any other request succeeds. Changing a password revokes the account's other sessions; resetting or disabling revokes all of them. The last enabled admin cannot be disabled or demoted. Passwords are PBKDF2 SHA-256 hashes compared in constant time; sessions are HTTP-only, same-site cookies expiring after 12 hours, and `sessions.user_id` binds them to an account. Sign-in errors do not reveal whether a username exists, and only failures are rate limited: 5 per username and address and 20 per address per 15 minutes. Score history records the editor's profile id in `History.by`.

During the transition the shared editing password still works (`POST /api/league` `login`; its sessions have no `user_id`), can edit league data but cannot manage accounts, and is recorded as `legacy` in history. It is removed once every member has an account.

## Migrations, backup and rollback

Schema changes are additive only: new tables, new nullable columns and new indexes. No migration may drop, rebuild or rewrite an existing table, and none may modify the `league` row. `drizzle/` is copied into the build output (`dist/.openai/drizzle`) for the platform to apply on deploy.

- **Backup before every deploy that adds a migration:** `npm run db:backup` (read-only `GET /api/league` on the public Site plus every badge it references) writes `backups/<timestamp>/` containing `league.json`, the badge files and `manifest.json` with SHA-256 hashes. `backups/` is ignored by Git. A full D1 export would need direct Cloudflare access to the Site's database, which ChatGPT Sites does not expose here.
- **Check the migration against that backup:** `npm run test:migration -- backups/<timestamp>/league.json` (no argument uses synthetic data). It builds a throwaway local D1 under `.wrangler/migration-test`, applies `0000`, loads the league row with a legacy password, session and rate-limit row, applies the remaining migrations, and fails unless those rows are byte-identical and standings for every season, results, history and badges are unchanged. It never touches `.wrangler/state`.
- **Code rollback:** redeploy the previous commit. Added tables and columns are ignored by older code, which still inserts sessions without `user_id`. The league JSON is rewritten whole, so fields added later (such as `History.by`) are preserved.
- **Data restore:** `league.json` holds the exact `state` and `version`. There is no restore endpoint; writing it back needs either platform access to the Site's D1 or a temporary owner-only restore action. Badges can be re-uploaded from `backups/<timestamp>/badges/` through the profile editor.
- **After the shared password is removed:** rolling code back to a shared-password release shows first-time setup again, and the verified owner sets a new shared password.

## Verification

- `npm test` runs the league, migration and member-account tests; it builds first and needs no running dev server
- `node node_modules/typescript/bin/tsc --noEmit`
- `node scripts/test-league.mjs`
- `node scripts/test-members.mjs` (after a build; starts `wrangler dev` on a throwaway D1 in `.wrangler/test-members`, port 8791 or `TEST_PORT`)
- `node scripts/test-migration.mjs` (optionally with a `backups/<timestamp>/league.json`)
- `node scripts/test-api.mjs` (fresh local D1 only, localhost:5173; creates test records and a temporary random test password)
- `node scripts/run-framework.mjs build`

Local database files and R2 test uploads are ignored and never included in deployment. Production starts with KEVIN, Dioxzyp, YEPPO, EKAI and Season 01, without match results.

Tie-breaks: points, goal difference, goals scored, then head-to-head points among the still-tied group. Remaining ties use names only for stable display.

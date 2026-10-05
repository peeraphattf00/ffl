# FC Friends League

Thai mobile-friendly FC27 Ultimate Team league app. Profiles are shared across seasons. Competitions choose existing profiles and single or double round robin fixtures. Only recorded scores contribute to standings; 0–0 is a recorded draw. Archived competitions retain history but do not count in standings.

## Data and editing

D1 stores versioned league state, immutable score history within that state, password hashes, expiring sessions, and login rate limits. Updates use an atomic compare-and-swap on the version: concurrent editors must refresh rather than overwrite each other. Undo restores the previous score only within 30 seconds and only when that match has not subsequently changed. Historical restore is explicit and appends a new event. Profile IDs stay stable when names and badges change.

R2 stores cropped badges. The app accepts PNG/JPEG/WebP, crops to 512×512, verifies file signatures server-side, and limits stored files to 2 MB. Profiles can be deactivated without deleting history. Programs with recorded history lock their participants, season, and format.

## Authentication

The Site starts owner-private. The verified Site owner sets the initial shared password in the app; there is no default password. Passwords are PBKDF2 SHA-256 hashes, with HTTP-only, same-site session cookies expiring after 12 hours. Platform access remains separate from the shared editing password. Public viewing requires an explicit Site audience change by the owner.

## Migrations, backup and rollback

Schema changes are additive only: new tables, new nullable columns and new indexes. No migration may drop, rebuild or rewrite an existing table, and none may modify the `league` row. `drizzle/` is copied into the build output (`dist/.openai/drizzle`) for the platform to apply on deploy.

- **Backup before every deploy that adds a migration:** `npm run db:backup` (read-only `GET /api/league` on the public Site plus every badge it references) writes `backups/<timestamp>/` containing `league.json`, the badge files and `manifest.json` with SHA-256 hashes. `backups/` is ignored by Git. A full D1 export would need direct Cloudflare access to the Site's database, which ChatGPT Sites does not expose here.
- **Check the migration against that backup:** `npm run test:migration -- backups/<timestamp>/league.json` (no argument uses synthetic data). It builds a throwaway local D1 under `.wrangler/migration-test`, applies `0000`, loads the league row with a legacy password, session and rate-limit row, applies the remaining migrations, and fails unless those rows are byte-identical and standings for every season, results, history and badges are unchanged. It never touches `.wrangler/state`.
- **Code rollback:** redeploy the previous commit. Added tables and columns are ignored by older code, which still inserts sessions without `user_id`. The league JSON is rewritten whole, so fields added later (such as `History.by`) are preserved.
- **Data restore:** `league.json` holds the exact `state` and `version`. There is no restore endpoint; writing it back needs either platform access to the Site's D1 or a temporary owner-only restore action. Badges can be re-uploaded from `backups/<timestamp>/badges/` through the profile editor.
- **After the shared password is removed:** rolling code back to a shared-password release shows first-time setup again, and the verified owner sets a new shared password.

## Verification

- `node node_modules/typescript/bin/tsc --noEmit`
- `node scripts/test-league.mjs`
- `node scripts/test-migration.mjs` (optionally with a `backups/<timestamp>/league.json`)
- `node scripts/test-api.mjs` (fresh local D1 only, localhost:5173; creates test records and a temporary random test password)
- `node scripts/run-framework.mjs build`

Local database files and R2 test uploads are ignored and never included in deployment. Production starts with KEVIN, Dioxzyp, YEPPO, EKAI and Season 01, without match results.

Tie-breaks: points, goal difference, goals scored, then head-to-head points among the still-tied group. Remaining ties use names only for stable display.

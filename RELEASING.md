# Releasing core.

The same rules apply in every Science By Hugs repository: Core, Nexus, Pulse and the website.

## Branches

| Branch | Means | Who changes it |
| --- | --- | --- |
| `main` | Releases: what is live (core.sciencebyhugs.com for 1.0 web, the App Store app for 2.0) | Pull request only, merged by Anthony |
| `staging` | Where all app development happens; the staging app and TestFlight builds come from here | Pull request only, merged by Anthony |
| `feat/…`, `fix/…`, `design/…`, `ci/…`, `docs/…` | One piece of work | Anyone; deleted automatically after merge |

- **All app development happens on `staging`.** `main` changes only when a release is ready: one pull request from `staging` to `main`, approved by Anthony.
- Nobody pushes straight to `main` or `staging`. Changes go through a pull request with CI passing.
- Work branches start from `staging` and target it.
- Stacked work (one PR building on another) points each PR at the branch before it, so every PR shows only its own changes. Merge from the bottom up.

## Staging app and production app

| | Built from | Backend | Name on the phone | Bundle id |
| --- | --- | --- | --- | --- |
| Staging app | `staging` | Staging (test accounts, sandbox payments) | core staging | `com.sciencebyhugs.core.staging` |
| Production app | `main` | Production | core | `com.sciencebyhugs.core` |

The two install side by side. The staging app refuses production backends and keys; the production app never points at staging.

Status (Oct 25, 2026): the staging app exists in `expo/` and currently uses `com.sciencebyhugs.core.expo.staging` so it could sit beside the old Capacitor staging shell; it moves to `com.sciencebyhugs.core.staging` now that 2.0 is app-only. Staging backend: Supabase `evyssawhlarqqhgyswhz`. The production app's bundle id must match the existing App Store record (to confirm).

## Versions

core. uses `MAJOR.MINOR.PATCH`:

- **MAJOR**: a new generation of the app (1.0 → 2.0).
- **MINOR**: new features.
- **PATCH**: fixes only.

iOS builds also carry a build number that only goes up (EAS stores it remotely). The version is what people see; the build number identifies one exact IPA.

## Tags and releases

Every build that leaves the building gets a git tag and a GitHub Release.

| Kind | Tag | Example |
| --- | --- | --- |
| App Store release | `core-vX.Y.Z` | `core-v2.0.0` |
| Web 1.0 (live today) | `core-v1.0.0` | Commit `7e36f4a` |
| Staging / TestFlight build | `core-vX.Y.Z+BUILD` | `core-v2.0.0+1` |

The release notes say what changed, the exact commit, and how it was verified (CI run, device checks). For iOS builds, include the IPA SHA-256 and keep the IPA and crash symbols.

Never tag a commit you can't prove the build came from.

## Approvals

- Draft PRs, branches and CI changes: anyone.
- Merging, deploying, signed builds, TestFlight or App Store uploads, and production changes: **Anthony only, each time, for that specific action**.
- Staging work never touches production backends.

## Restoring an old branch

Core's old `codex/` branches were fully merged into `staging`, so nothing was archived here. Other repositories keep old branches on `archive/2026-10-25`; restore one the same way:

```sh
git fetch origin archive/2026-10-25
git show origin/archive/2026-10-25:ARCHIVE.md   # find the branch and its commit
git push origin <commit>:refs/heads/<branch>
```

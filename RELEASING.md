# Releasing core.

The same rules apply in every Science By Hugs repository: Core, Nexus, Pulse and the website.

## Branches

| Branch | Means | Who changes it |
| --- | --- | --- |
| `main` | What is live: core.sciencebyhugs.com (core 1.0) and the App Store app | Pull request only, merged by Anthony |
| `staging` | What's on TestFlight and the staging site (2.0 work) | Pull request only, merged by Anthony |
| `feat/…`, `fix/…`, `design/…`, `ci/…`, `docs/…` | One piece of work | Anyone; deleted automatically after merge |

- Nobody pushes straight to `main` or `staging`. Changes go through a pull request with CI passing.
- Work branches start from `staging` and target it.
- Stacked work (one PR building on another) points each PR at the branch before it, so every PR shows only its own changes. Merge from the bottom up.

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
| Production release | `core-vX.Y.Z` | `core-v1.0.0` (live 1.0 code, commit `7e36f4a`) |
| TestFlight build | `core-vX.Y.Z+BUILD` | `core-v2.0.0+1` |
| Staging web deploy | `core-vX.Y.Z-staging.N` | `core-v2.0.0-staging.1` |

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

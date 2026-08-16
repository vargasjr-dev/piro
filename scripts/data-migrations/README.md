# One-time production data operations

Put one-time, narrowly scoped production data repairs or read-only analyses in this directory and run them through `.github/workflows/run-data-migration.yml`.

## Workflow

1. Add a narrowly scoped `.ts` or `.js` script in this directory in its own PR.
2. Make the script safe to review and rerun:
   - select and log the intended rows before changing them;
   - assert the expected row count and current values;
   - update only by stable primary key or another unique identity;
   - verify the resulting values before exiting;
   - fail instead of guessing when the database state differs from expectations.
3. Open the PR against `main` in this repository. Fork PRs are intentionally rejected because the workflow executes PR code with production database access.
4. Manually dispatch **Run PR Data Migration** with:
   - the open PR number;
   - the script path, such as `scripts/data-migrations/repair-global-ashfall-path.ts`.
5. Approve the protected `production-migrations` environment when GitHub requests approval.
6. Review the workflow log and the script's before/after assertions.

The workflow checks out the exact PR head SHA, serializes all production data-operation runs, and exposes only the selected credential set (`DATABASE_URL` or the bucket credentials) to the operation process. It does not merge the PR or apply schema changes.

## Boundaries

- Use this runner for data repairs and read-only analyses only. Schema changes belong in `data/schema.ts` and the declarative DB Schema Apply workflow.
- Never put credentials in a migration script, commit generated SQL, or use a broad update without assertions.
- Prefer an explicit transaction and a fail-closed row-count check. If the script cannot be safely rerun, make that limitation explicit in the PR and verify the target state before writing.
- Keep each script focused on one repair and leave it in the repository as an audit record after execution.

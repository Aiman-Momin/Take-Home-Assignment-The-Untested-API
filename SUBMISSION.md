# Submission Notes

## What's included

| Deliverable | Location |
|---|---|
| Unit tests (service and validators) | `task-api/tests/taskService.test.js`, `task-api/tests/validators.test.js` |
| Integration tests (Supertest) | `task-api/tests/tasks.routes.test.js` |
| Bug report | [`BUG_REPORT.md`](./BUG_REPORT.md) |
| Bug fix (BUG-1, pagination) | `task-api/src/services/taskService.js`, `getPaginated` |
| New endpoint and its tests | `PATCH /tasks/:id/assign` in `routes/tasks.js`, `taskService.assignTask`, `validators.validateAssignTask`, `tests/assign.test.js` |

Each part is a separate commit (tests, then the fix, then the feature), so the diffs can be reviewed one step at a time.

## Coverage (`npm run coverage`)

```
-----------------|---------|----------|---------|---------|-------------------
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------|---------|----------|---------|---------|-------------------
All files        |   98.72 |     97.7 |   96.66 |    98.6 |
 app.js          |   84.61 |       75 |      50 |   84.61 | 17-18
 routes/tasks.js |     100 |      100 |     100 |     100 |
 taskService.js  |     100 |    94.73 |     100 |     100 | 23
 validators.js   |     100 |      100 |     100 |     100 |
-----------------|---------|----------|---------|---------|-------------------
Tests: 88 passed, 88 total
```

The only uncovered lines in `app.js` are the `app.listen` block, which only runs when the file is started directly and not when tests import the app.

## How I handled bugs in tests

Tests for known, unfixed bugs use Jest's `test.failing`. Each one states the **correct** behavior, so the suite stays green today, and Jest will fail the test once someone fixes the bug. That tells them to change it to a normal `test`. I did exactly this for BUG-1: I fixed it and changed its `test.failing` cases to `test`.

## Why I fixed BUG-1 (pagination)

It was the highest-impact bug that also had a clear, contained fix. Every paginated client loses its first page of results, and on small data sets pagination looks completely broken. The fix is one line, and the intended behavior is not in doubt: the route already defaults `page` to `1`. BUG-4 (mass assignment) is just as serious, but fixing it means deciding which fields are client-editable, and I'd want to check that with the team first.

## `PATCH /tasks/:id/assign`: design decisions

- **Validation:** `assignee` must be a string that is non-empty after trimming, with a maximum length of 100 characters. Otherwise the endpoint returns `400` with an error message. Missing, `null`, numbers, arrays, `""` and `"   "` are all rejected. An empty string is treated as a mistake, not as a way to unassign: unassigning silently through `""` is easy to trigger by accident.
- **Normalisation:** The name is stored trimmed, so `"  Aiman "` and `"Aiman"` don't become two different assignees.
- **Already assigned:** Reassignment is allowed and overwrites the previous assignee (`200`). Assigning the same person again is a no-op that also returns `200`. This matches how Jira, GitHub and similar trackers behave, and the only other way to reassign would be through `PUT`, which has no validation (see BUG-4). The alternative is `409 Conflict` when the task already has a different assignee. That is safer when two people might grab the same task at once, but it needs a separate unassign endpoint. It's a product decision, and I've listed it in the questions below.
- **Only `assignee` changes:** Any other keys in the body (`status`, `title` and so on) are ignored. There's a test for this, because this endpoint shouldn't repeat BUG-4.
- **Order of checks:** The body is validated before the task is looked up, the same way `PUT` does it. So a bad body sent to a missing id returns `400`, not `404`.
- **Task shape:** New tasks now start with `assignee: null`, so every task has the field and clients don't need to handle it being absent.
- **Completed tasks:** These can still be assigned. Assignment is useful for record-keeping, and nothing in the brief says otherwise.

## What I'd test next

- Validation and normalisation of the `?status`, `?page` and `?limit` query parameters, once the intended behavior is agreed (BUG-2 and BUG-8).
- Status and `completedAt` transitions through `PUT` (BUG-6), as a small state-machine test table.
- Date edge cases: time zones, a `dueDate` of exactly "now" for overdue, and strict ISO parsing.
- Contract tests that check every response against one task-shape schema, which would have caught the README mismatch (BUG-9).
- Payload limits, such as very large bodies and very long titles.

## What surprised me

- `completeTask` hard-codes `priority: 'medium'`. It looks like copy-paste from `create` and quietly destroys data.
- `includes()` used for an equality check in the status filter.
- The README and the code disagree on status values, so the documentation can't be trusted as the spec.
- `PUT` is described as a "full update" but is really a partial merge that accepts *any* key, including `id`.

## Questions before shipping to production

- Which fields can clients edit through `PUT`? Is it meant to be a full replace or a partial `PATCH`-style update?
- Should reassignment be allowed freely, or require unassigning first (the `409` option)? Do we need an unassign endpoint? Should `assignee` be a free-text name or a reference to a real user id?
- Is the in-memory store intentional for v1? All data is lost on every restart or deploy, and nothing is shared between instances.
- Is there any authentication or authorisation? Right now anyone can edit or delete any task.
- What should list endpoints return by default: all tasks, or a paginated envelope with `total` and `page`? Should `status` and pagination be combinable? At the moment `status` takes precedence and pagination is ignored.

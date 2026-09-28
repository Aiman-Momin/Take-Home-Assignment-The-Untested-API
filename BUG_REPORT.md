# Bug Report — Task API

Bugs found while writing the test suite in `task-api/tests/`. Each bug that has a test is written as `test.failing(...)` and tagged `BUG-n`. That way the suite stays green, the test says what the correct behavior is, and Jest will flag the test as soon as someone fixes the bug (a `test.failing` that passes counts as a failure), which is the cue to change it to a normal `test`.

| # | Severity | Area | Status |
|---|----------|------|--------|
| 1 | High | Pagination skips the first page | **Fixed** |
| 2 | Medium | Status filter matches substrings | Open |
| 3 | Medium | Completing a task resets its priority | Open |
| 4 | High | `PUT` can overwrite server-owned fields | Open |
| 5 | Low | Malformed JSON returns 500, not 400 | Open |
| 6 | Medium | `completedAt` is out of sync with `status` when set via `PUT` | Open |
| 7 | Low | Validators let falsy/odd values through | Open |
| 8 | Low | Negative `page` returns arbitrary slices | Open |
| 9 | Low | README documents the wrong status values | Open |

---

### BUG-1 — Pagination is off by one page (FIXED)

- **Where:** `src/services/taskService.js` → `getPaginated` (originally `const offset = page * limit;`)
- **Expected:** `GET /tasks?page=1&limit=2` returns tasks 1–2.
- **Actual:** It returns tasks 3–4. Page 1 is skipped entirely, and on a small data set every page looks empty. The route defaults `page` to `1` (`parseInt(page) || 1`), so the route treats pages as 1-based while the service treats them as 0-based.
- **How found:** Integration test `page=1 returns the first page` with 5 seeded tasks got `['task 3','task 4']`.
- **Fix:** `const offset = (page - 1) * limit;`. I also added a comment saying pages are 1-based, and a `page=2` test to pin the offset math.

### BUG-2 — `?status=` does substring matching

- **Where:** `taskService.js:9`, `t.status.includes(status)`
- **Expected:** Only exact matches. `?status=do` should return nothing.
- **Actual:** `String.prototype.includes` does a substring check, so `?status=do` returns both `todo` and `done`, and `?status=o` returns almost everything.
- **How found:** Test `does not match on a partial status string`. The bug was visible when reading the code, and the test confirmed it.
- **Fix:** `t.status === status`. Ideally the route should also reject values outside `VALID_STATUSES` with a 400.

### BUG-3 — `PATCH /:id/complete` resets priority to `medium`

- **Where:** `taskService.js:71`, the hard-coded `priority: 'medium'` inside `completeTask`
- **Expected:** Completing a task changes `status` and `completedAt` and nothing else.
- **Actual:** A `high` priority task becomes `medium` once it is completed. The data is lost silently, which will distort any reporting by priority.
- **How found:** Test `preserves the task priority`.
- **Fix:** Delete the `priority: 'medium'` line.

### BUG-4 — `PUT /:id` allows mass assignment of any field

- **Where:** `taskService.js:52`, `{ ...tasks[index], ...fields }`, with the whole `req.body` passed in from `routes/tasks.js`
- **Expected:** Clients can change `title`, `description`, `status`, `priority` and `dueDate`. The server owns `id`, `createdAt` and `completedAt`.
- **Actual:** Any key in the body gets merged in. `PUT {"id":"x"}` changes the task's id, so the task can no longer be found at its old URL and ids can collide. Clients can also backdate `createdAt`, forge `completedAt`, or add arbitrary junk keys. This also bypasses the new assign validation: `PUT {"assignee": ""}` is accepted.
- **How found:** Tests `does not allow overwriting id or createdAt` (unit) and `ignores attempts to change the id` (integration).
- **Fix:** Whitelist the fields: `const { title, description, status, priority, dueDate } = fields;` and merge only the keys that are defined. Validate `assignee` in `validateUpdateTask` as well, or leave it out of the whitelist.

### BUG-5 — Malformed JSON body returns 500

- **Where:** `src/app.js:9-12`, the catch-all error handler
- **Expected:** `400 Bad Request`. This is a client error.
- **Actual:** `express.json()` throws a `SyntaxError` with `err.status = 400`, but the handler ignores that and always sends 500. It also logs a stack trace for a normal client mistake.
- **How found:** Test `returns 400 (not 500) for malformed JSON`.
- **Fix:** `res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' })`. Only log stack traces when the status is 500.

### BUG-6 — `status` and `completedAt` can disagree

- **Where:** `taskService.js`, `update`, which never touches `completedAt`
- **Expected:** A task with `status: 'done'` has a `completedAt`, and one that isn't done has `completedAt: null`.
- **Actual:** `PUT {"status":"done"}` leaves `completedAt: null`. Reopening a completed task with `PUT {"status":"todo"}` keeps the old `completedAt`. `completeTask` also re-stamps `completedAt` every time it is called on a task that is already done.
- **How found:** Probing the service directly after writing the `completeTask` tests.
- **Fix:** In `update`, set `completedAt` when status changes to `done` and clear it when status changes away from `done`. Make `completeTask` idempotent by keeping the existing `completedAt`.

### BUG-7 — Validators accept falsy or loosely typed values

- **Where:** `src/utils/validators.js:8, 14, 24, 30`, which use `if (body.status && ...)` and `if (body.dueDate && ...)`
- **Expected:** An invalid value is rejected, whatever its type.
- **Actual:**
  - `POST {"title":"a","status":""}` passes validation. The destructuring default in `create` only applies to `undefined`, so the task is **stored with `status: ""`**. It then disappears from every status filter and from the stats counts.
  - `Date.parse` is lenient, so `dueDate: "1"` or `"2024"` counts as a "valid ISO date".
  - `description` is never validated, so objects or numbers are stored as-is.
- **How found:** Probing the validators while writing their unit tests.
- **Fix:** Check `!== undefined` instead of truthiness. Validate dates with a strict ISO-8601 regex before calling `Date.parse`. Check that `typeof description === 'string'`.

### BUG-8 — Negative or zero `page`/`limit` are not handled

- **Where:** `src/routes/tasks.js:20-21`
- **Expected:** A 400 error, or clamping to `page >= 1` and `1 <= limit <= some max`.
- **Actual:** `page=-1&limit=2` computes a negative offset, and `slice` counts it from the end of the array, so the response is an unrelated slice. `page=0` or `limit=0` silently fall back to the defaults because `0 || 1`. `limit` has no upper bound.
- **How found:** Probing after fixing BUG-1.
- **Fix:** Parse with `Number.parseInt(x, 10)` and return 400 when the result is not a positive integer. Cap `limit` (for example at 100).

### BUG-9 — README task shape doesn't match the code

- **Where:** `README.md`, "Task shape"
- **Expected:** The documentation matches the API.
- **Actual:** The README lists statuses as `pending | in-progress | completed`, but the code (and `ASSIGNMENT.md`) uses `todo | in_progress | done`. A client built from the README gets a 400 on every create that sets a status.
- **Fix:** Update the README.

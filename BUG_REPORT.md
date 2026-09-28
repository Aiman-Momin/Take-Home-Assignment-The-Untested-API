# Bug report

Found these while writing tests. For the ones I didn't fix, the test is written with `test.failing` and asserts what *should* happen, tagged with the bug number in a comment. Jest flips it to a failure once the bug is fixed, so you can't forget to update it.

## 1. Pagination skips the first page (fixed)

`taskService.getPaginated` did `offset = page * limit`. But the route defaults `page` to 1, so `?page=1&limit=2` returned tasks 3 and 4. With under 10 tasks, `?page=1` just returns `[]`, which is how I noticed. My first pagination test got back `['task 3', 'task 4']`.

Expected: page 1 = first `limit` tasks.
Fix: `offset = (page - 1) * limit`. Added a page=2 test too.

## 2. `?status=` matches substrings

`getByStatus` uses `t.status.includes(status)`. So `?status=do` gives you both `todo` and `done`, and `?status=o` gives you pretty much everything. Should be `===`. Probably also worth returning 400 for a status that isn't in `VALID_STATUSES` instead of an empty list.

## 3. Completing a task resets priority to medium

`completeTask` has `priority: 'medium'` hardcoded in the object it builds. A high priority task becomes medium the moment you complete it. It looks like it was copied from `create`. Fix is to delete that line.

## 4. PUT lets you overwrite anything, including `id`

`update` does `{ ...tasks[index], ...fields }` and the route passes `req.body` straight through. `PUT /tasks/:id` with `{"id": "x"}` changes the task's id, and the old URL 404s after that. Same for `createdAt` and `completedAt`, or any random key you send. It also means `PUT {"assignee": ""}` gets around the validation on the new assign endpoint.

Fix: pick out the editable fields (`title, description, status, priority, dueDate`) and only merge those. I didn't fix this one because it's a question of what clients are *supposed* to be able to edit, and I'd want to confirm that first.

## 5. Bad JSON returns 500

If you send `{"title": ` with a JSON content type, `express.json()` throws a SyntaxError that already has `status: 400` on it. The error handler in `app.js` ignores that and always sends 500, and it logs a stack trace. Fix: `res.status(err.status || 500)`, and only log when it's actually a 500.

## 6. `status` and `completedAt` get out of sync

- `PUT {"status": "done"}` leaves `completedAt` null.
- `PUT {"status": "todo"}` on a completed task keeps the old `completedAt`.
- Calling `/complete` twice overwrites `completedAt` with the second time.

I found these poking at the service in a node REPL after writing the complete tests. Fix: have `update` set or clear `completedAt` when the status changes, and make `completeTask` keep the existing timestamp if the task is already done.

## 7. Validators let through empty and weird values

The checks are written `if (body.status && ...)`, so an empty string skips validation entirely. `POST {"title": "a", "status": ""}` gets saved with `status: ""`, because the default in `create` only kicks in for `undefined`. After that the task doesn't show up under any status filter or in stats.

Also: `Date.parse("1")` is valid, so `dueDate: "1"` passes as an "ISO date". And `description` isn't checked at all; you can store an object in it.

Fix: check `!== undefined` rather than truthiness, use a stricter date check, and add a typeof check on description.

## 8. Negative page/limit

`?page=-1&limit=2` gives a negative offset, and `slice` counts from the end, so you get some random chunk of tasks back. `page=0` quietly becomes 1 because of `parseInt(page) || 1`. There's no max on `limit` either. I'd return 400 for anything that isn't a positive integer, and cap limit at something like 100.

## 9. README has the wrong statuses

README says `pending | in-progress | completed`. The code (and ASSIGNMENT.md) use `todo | in_progress | done`. Anyone building against the README gets a 400 as soon as they set a status.

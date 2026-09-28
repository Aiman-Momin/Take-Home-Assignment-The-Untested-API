# Notes

Tests are in `task-api/tests/`, bugs are in `BUG_REPORT.md`. The commits go tests → fix → feature → docs, so each one can be looked at separately.

Coverage from `npm run coverage`:

```
All files        |   98.72 |     97.7 |   96.66 |    98.6 |
 app.js          |   84.61 |       75 |      50 |   84.61 | 17-18
 routes/tasks.js |     100 |      100 |     100 |     100 |
 taskService.js  |     100 |    94.73 |     100 |     100 | 23
 validators.js   |     100 |      100 |     100 |     100 |
Tests: 88 passed, 88 total
```

The only lines not covered in app.js are the `app.listen` block, which never runs when the tests import the app.

## Which bug I fixed

Pagination (#1). Every client that pages lost the first page, and the fix was one line with no real ambiguity, since the route already assumes pages start at 1. #4 (PUT overwriting `id`) is probably just as bad, but fixing it means deciding which fields are editable, and that felt like something to ask about rather than guess.

## PATCH /tasks/:id/assign

- `assignee` has to be a string that isn't empty after trimming, and it's capped at 100 chars. Anything else gets a 400. I didn't want `""` to mean "unassign", because it's too easy to send by accident, e.g. an empty form field.
- The name is trimmed before it's saved, so `" Aiman"` and `"Aiman"` aren't two different people.
- If the task is already assigned, the new name just replaces the old one. I went back and forth on returning 409 instead. That would stop two people grabbing the same task at the same time, but then you'd need a separate unassign endpoint to hand a task over. Overwriting is how most trackers work, so I went with that. Easy to change if you'd prefer 409.
- Only `assignee` changes. If you send `status` or `title` in the body, they're ignored. I added a test for that since PUT has the opposite problem (#4).
- The body is validated before the task is looked up, same as PUT. So a bad body on a missing id is a 400, not a 404.
- New tasks now start with `assignee: null`, so the field is always there.

## Things I'd test next

- The query param handling (#2, #8), once it's decided what bad input should do.
- Status/completedAt transitions through PUT (#6). A table of from → to cases would cover it.
- The overdue calculation right around "now", and time zones on `dueDate`.
- Some kind of schema check on every response. That would have caught the README mismatch.

## What surprised me

The hardcoded `priority: 'medium'` in `completeTask`. It's clearly left over from copying `create`, and nothing would ever tell you it's wrong except a user noticing their priorities changing. Also `includes()` used for an equality check. And the README being wrong about statuses meant I couldn't treat it as the spec, so I went by the code.

## Before shipping

- What is PUT supposed to allow? Full replace or partial update, and which fields?
- Is `assignee` meant to be a free-text name, or should it point at a real user? And should reassigning be allowed freely?
- Is in-memory storage deliberate? Everything is lost on every deploy, and it breaks as soon as there's more than one instance.
- There's no auth at all. Anyone can delete anyone's tasks.
- `?status=` and `?page=` can't be combined right now (status wins and pagination is ignored). Is that intended?

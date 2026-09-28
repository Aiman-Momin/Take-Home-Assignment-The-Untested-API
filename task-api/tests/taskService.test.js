const taskService = require('../src/services/taskService');

const PAST = '2000-01-01T00:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';

beforeEach(() => {
  taskService._reset();
});

describe('create', () => {
  test('applies defaults for optional fields', () => {
    const task = taskService.create({ title: 'Write tests' });

    expect(task).toMatchObject({
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
    });
    expect(task.id).toEqual(expect.any(String));
    expect(Date.parse(task.createdAt)).not.toBeNaN();
  });

  test('keeps provided fields', () => {
    const task = taskService.create({
      title: 'Ship',
      description: 'to prod',
      status: 'in_progress',
      priority: 'high',
      dueDate: FUTURE,
    });

    expect(task).toMatchObject({
      description: 'to prod',
      status: 'in_progress',
      priority: 'high',
      dueDate: FUTURE,
    });
  });

  test('generates a unique id per task', () => {
    const a = taskService.create({ title: 'a' });
    const b = taskService.create({ title: 'b' });
    expect(a.id).not.toBe(b.id);
  });

  test('ignores unknown fields such as a client-supplied id', () => {
    const task = taskService.create({ title: 'a', id: 'mine', completedAt: PAST });
    expect(task.id).not.toBe('mine');
    expect(task.completedAt).toBeNull();
  });
});

describe('getAll / findById', () => {
  test('getAll returns every task in insertion order', () => {
    taskService.create({ title: 'a' });
    taskService.create({ title: 'b' });
    expect(taskService.getAll().map((t) => t.title)).toEqual(['a', 'b']);
  });

  test('getAll returns a copy, so mutating it does not affect the store', () => {
    taskService.create({ title: 'a' });
    taskService.getAll().pop();
    expect(taskService.getAll()).toHaveLength(1);
  });

  test('findById returns the task or undefined', () => {
    const task = taskService.create({ title: 'a' });
    expect(taskService.findById(task.id)).toEqual(task);
    expect(taskService.findById('nope')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  beforeEach(() => {
    taskService.create({ title: 't', status: 'todo' });
    taskService.create({ title: 'p', status: 'in_progress' });
    taskService.create({ title: 'd', status: 'done' });
  });

  test('returns tasks with an exact status match', () => {
    expect(taskService.getByStatus('todo').map((t) => t.title)).toEqual(['t']);
    expect(taskService.getByStatus('done').map((t) => t.title)).toEqual(['d']);
  });

  test('returns an empty list for an unknown status', () => {
    expect(taskService.getByStatus('archived')).toEqual([]);
  });

  // BUG-2: uses String#includes, so partial strings match.
  test.failing('does not match on a partial status string', () => {
    expect(taskService.getByStatus('do')).toEqual([]);
  });
});

describe('getPaginated', () => {
  beforeEach(() => {
    for (let i = 1; i <= 5; i++) taskService.create({ title: `task ${i}` });
  });

  // BUG-1: page is treated as 0-based, so page 1 skips the first page.
  test.failing('page 1 returns the first `limit` tasks', () => {
    const titles = taskService.getPaginated(1, 2).map((t) => t.title);
    expect(titles).toEqual(['task 1', 'task 2']);
  });

  test.failing('last page returns the remainder', () => {
    const titles = taskService.getPaginated(3, 2).map((t) => t.title);
    expect(titles).toEqual(['task 5']);
  });

  test('a page past the end is empty', () => {
    expect(taskService.getPaginated(10, 2)).toEqual([]);
  });
});

describe('getStats', () => {
  test('returns zeros for an empty store', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  test('counts by status and counts overdue only for unfinished past-due tasks', () => {
    taskService.create({ title: 'a', status: 'todo', dueDate: PAST }); // overdue
    taskService.create({ title: 'b', status: 'in_progress', dueDate: PAST }); // overdue
    taskService.create({ title: 'c', status: 'done', dueDate: PAST }); // done, not overdue
    taskService.create({ title: 'd', status: 'todo', dueDate: FUTURE }); // not due yet
    taskService.create({ title: 'e', status: 'todo' }); // no due date

    expect(taskService.getStats()).toEqual({ todo: 3, in_progress: 1, done: 1, overdue: 2 });
  });
});

describe('update', () => {
  test('merges fields into the existing task', () => {
    const task = taskService.create({ title: 'a', priority: 'low' });
    const updated = taskService.update(task.id, { title: 'b' });

    expect(updated).toMatchObject({ id: task.id, title: 'b', priority: 'low' });
    expect(taskService.findById(task.id).title).toBe('b');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.update('nope', { title: 'b' })).toBeNull();
  });

  // BUG-4: fields are spread wholesale, so server-owned fields can be overwritten.
  test.failing('does not allow overwriting id or createdAt', () => {
    const task = taskService.create({ title: 'a' });
    const updated = taskService.update(task.id, { id: 'hijacked', createdAt: PAST });
    expect(updated.id).toBe(task.id);
    expect(updated.createdAt).toBe(task.createdAt);
  });
});

describe('remove', () => {
  test('deletes the task and returns true', () => {
    const task = taskService.create({ title: 'a' });
    expect(taskService.remove(task.id)).toBe(true);
    expect(taskService.findById(task.id)).toBeUndefined();
  });

  test('returns false for an unknown id', () => {
    expect(taskService.remove('nope')).toBe(false);
  });
});

describe('completeTask', () => {
  test('sets status to done and stamps completedAt', () => {
    const task = taskService.create({ title: 'a' });
    const done = taskService.completeTask(task.id);

    expect(done.status).toBe('done');
    expect(Date.parse(done.completedAt)).not.toBeNaN();
    expect(taskService.findById(task.id).status).toBe('done');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.completeTask('nope')).toBeNull();
  });

  // BUG-3: completing a task silently resets its priority to "medium".
  test.failing('preserves the task priority', () => {
    const task = taskService.create({ title: 'a', priority: 'high' });
    expect(taskService.completeTask(task.id).priority).toBe('high');
  });
});

const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

const PAST = '2000-01-01T00:00:00.000Z';

const createTask = (body) => request(app).post('/tasks').send(body).expect(201).then((res) => res.body);

beforeEach(() => {
  taskService._reset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /tasks', () => {
  test('returns an empty array when there are no tasks', async () => {
    const res = await request(app).get('/tasks').expect(200);
    expect(res.body).toEqual([]);
  });

  test('returns all tasks', async () => {
    await createTask({ title: 'a' });
    await createTask({ title: 'b' });

    const res = await request(app).get('/tasks').expect(200);
    expect(res.body.map((t) => t.title)).toEqual(['a', 'b']);
  });

  describe('?status=', () => {
    beforeEach(async () => {
      await createTask({ title: 't', status: 'todo' });
      await createTask({ title: 'p', status: 'in_progress' });
      await createTask({ title: 'd', status: 'done' });
    });

    test('filters by exact status', async () => {
      const res = await request(app).get('/tasks?status=in_progress').expect(200);
      expect(res.body.map((t) => t.title)).toEqual(['p']);
    });

    test('returns an empty array for an unknown status', async () => {
      const res = await request(app).get('/tasks?status=archived').expect(200);
      expect(res.body).toEqual([]);
    });

    // BUG-2: "?status=do" matches both "todo" and "done".
    test.failing('does not match partial status strings', async () => {
      const res = await request(app).get('/tasks?status=do').expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('pagination', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 5; i++) await createTask({ title: `task ${i}` });
    });

    // BUG-1: page 1 returns the second page.
    test.failing('page=1 returns the first page', async () => {
      const res = await request(app).get('/tasks?page=1&limit=2').expect(200);
      expect(res.body.map((t) => t.title)).toEqual(['task 1', 'task 2']);
    });

    test.failing('defaults to page 1 when only limit is given', async () => {
      const res = await request(app).get('/tasks?limit=3').expect(200);
      expect(res.body.map((t) => t.title)).toEqual(['task 1', 'task 2', 'task 3']);
    });

    test.failing('non-numeric limit falls back to 10', async () => {
      const res = await request(app).get('/tasks?page=1&limit=abc').expect(200);
      expect(res.body).toHaveLength(5);
    });

    test('a page past the end is empty', async () => {
      const res = await request(app).get('/tasks?page=99&limit=2').expect(200);
      expect(res.body).toEqual([]);
    });
  });
});

describe('POST /tasks', () => {
  test('creates a task and returns 201 with defaults applied', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Write tests' }).expect(201);

    expect(res.body).toMatchObject({
      title: 'Write tests',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
    });
    expect(res.body.id).toEqual(expect.any(String));

    const list = await request(app).get('/tasks');
    expect(list.body).toHaveLength(1);
  });

  test('returns 400 when title is missing', async () => {
    const res = await request(app).post('/tasks').send({ priority: 'high' }).expect(400);
    expect(res.body.error).toMatch(/title/);
  });

  test('returns 400 for an invalid status', async () => {
    const res = await request(app).post('/tasks').send({ title: 'a', status: 'pending' }).expect(400);
    expect(res.body.error).toMatch(/status/);
  });

  test('returns 400 for an invalid dueDate', async () => {
    await request(app).post('/tasks').send({ title: 'a', dueDate: 'tomorrow-ish' }).expect(400);
  });

  test('returns 400 when the body is sent with no JSON content', async () => {
    await request(app).post('/tasks').expect(400);
  });

  // BUG-5: malformed JSON hits the catch-all error handler and becomes a 500.
  test.failing('returns 400 (not 500) for malformed JSON', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": ')
      .expect(400);
  });
});

describe('PUT /tasks/:id', () => {
  test('updates the task and returns it', async () => {
    const task = await createTask({ title: 'a' });

    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'b', priority: 'high' }).expect(200);
    expect(res.body).toMatchObject({ id: task.id, title: 'b', priority: 'high' });

    const list = await request(app).get('/tasks');
    expect(list.body[0].title).toBe('b');
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/does-not-exist').send({ title: 'b' }).expect(404);
    expect(res.body.error).toBe('Task not found');
  });

  test('returns 400 for an empty title', async () => {
    const task = await createTask({ title: 'a' });
    await request(app).put(`/tasks/${task.id}`).send({ title: '  ' }).expect(400);
  });

  test('returns 400 for an invalid priority', async () => {
    const task = await createTask({ title: 'a' });
    await request(app).put(`/tasks/${task.id}`).send({ priority: 'urgent' }).expect(400);
  });

  // BUG-4: body is merged wholesale, so a client can rewrite the task id.
  test.failing('ignores attempts to change the id', async () => {
    const task = await createTask({ title: 'a' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ id: 'hijacked' }).expect(200);
    expect(res.body.id).toBe(task.id);
  });
});

describe('DELETE /tasks/:id', () => {
  test('deletes the task and returns 204', async () => {
    const task = await createTask({ title: 'a' });

    await request(app).delete(`/tasks/${task.id}`).expect(204);

    const list = await request(app).get('/tasks');
    expect(list.body).toEqual([]);
  });

  test('returns 404 for an unknown id', async () => {
    await request(app).delete('/tasks/does-not-exist').expect(404);
  });

  test('returns 404 when deleting the same task twice', async () => {
    const task = await createTask({ title: 'a' });
    await request(app).delete(`/tasks/${task.id}`).expect(204);
    await request(app).delete(`/tasks/${task.id}`).expect(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  test('marks the task done and sets completedAt', async () => {
    const task = await createTask({ title: 'a' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`).expect(200);
    expect(res.body.status).toBe('done');
    expect(Date.parse(res.body.completedAt)).not.toBeNaN();
  });

  test('returns 404 for an unknown id', async () => {
    await request(app).patch('/tasks/does-not-exist/complete').expect(404);
  });

  // BUG-3: completing a task resets priority to "medium".
  test.failing('does not change the priority', async () => {
    const task = await createTask({ title: 'a', priority: 'high' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`).expect(200);
    expect(res.body.priority).toBe('high');
  });
});

describe('GET /tasks/stats', () => {
  test('returns zero counts for an empty store', async () => {
    const res = await request(app).get('/tasks/stats').expect(200);
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  test('reflects created and completed tasks', async () => {
    await createTask({ title: 'a', dueDate: PAST });
    await createTask({ title: 'b', status: 'in_progress' });
    const c = await createTask({ title: 'c', dueDate: PAST });
    await request(app).patch(`/tasks/${c.id}/complete`).expect(200);

    const res = await request(app).get('/tasks/stats').expect(200);
    expect(res.body).toEqual({ todo: 1, in_progress: 1, done: 1, overdue: 1 });
  });

  test('is not shadowed by the /:id routes', async () => {
    const res = await request(app).get('/tasks/stats').expect(200);
    expect(res.body).toHaveProperty('overdue');
  });
});

const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');
const { validateAssignTask } = require('../src/utils/validators');

beforeEach(() => {
  taskService._reset();
});

describe('taskService.assignTask', () => {
  test('stores the assignee on the task', () => {
    const task = taskService.create({ title: 'a' });
    const updated = taskService.assignTask(task.id, 'Aiman');

    expect(updated).toMatchObject({ id: task.id, title: 'a', assignee: 'Aiman' });
    expect(taskService.findById(task.id).assignee).toBe('Aiman');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.assignTask('nope', 'Aiman')).toBeNull();
  });

  test('new tasks start unassigned', () => {
    expect(taskService.create({ title: 'a' }).assignee).toBeNull();
  });
});

describe('validateAssignTask', () => {
  test('accepts a non-empty string', () => {
    expect(validateAssignTask({ assignee: 'Aiman' })).toBeNull();
  });

  test.each([
    ['missing', {}],
    ['null', { assignee: null }],
    ['a number', { assignee: 42 }],
    ['an array', { assignee: ['Aiman'] }],
    ['empty', { assignee: '' }],
    ['whitespace only', { assignee: '   ' }],
    ['too long', { assignee: 'x'.repeat(101) }],
  ])('rejects an assignee that is %s', (_label, body) => {
    expect(validateAssignTask(body)).toMatch(/assignee/);
  });
});

describe('PATCH /tasks/:id/assign', () => {
  const assign = (id, body) => request(app).patch(`/tasks/${id}/assign`).send(body);

  test('assigns the task and returns the updated task', async () => {
    const task = taskService.create({ title: 'a', priority: 'high' });

    const res = await assign(task.id, { assignee: 'Aiman' }).expect(200);

    expect(res.body).toMatchObject({ id: task.id, title: 'a', priority: 'high', assignee: 'Aiman' });
    const list = await request(app).get('/tasks');
    expect(list.body[0].assignee).toBe('Aiman');
  });

  test('trims surrounding whitespace from the name', async () => {
    const task = taskService.create({ title: 'a' });
    const res = await assign(task.id, { assignee: '  Aiman  ' }).expect(200);
    expect(res.body.assignee).toBe('Aiman');
  });

  test('reassigns a task that is already assigned', async () => {
    const task = taskService.create({ title: 'a' });
    await assign(task.id, { assignee: 'Aiman' }).expect(200);

    const res = await assign(task.id, { assignee: 'Sam' }).expect(200);
    expect(res.body.assignee).toBe('Sam');
  });

  test('assigning the same person again is idempotent', async () => {
    const task = taskService.create({ title: 'a' });
    await assign(task.id, { assignee: 'Aiman' }).expect(200);

    const res = await assign(task.id, { assignee: 'Aiman' }).expect(200);
    expect(res.body.assignee).toBe('Aiman');
  });

  test('returns 404 for an unknown task', async () => {
    const res = await assign('does-not-exist', { assignee: 'Aiman' }).expect(404);
    expect(res.body.error).toBe('Task not found');
  });

  test('returns 400 for an empty assignee and leaves the task unchanged', async () => {
    const task = taskService.create({ title: 'a' });
    await assign(task.id, { assignee: 'Aiman' }).expect(200);

    const res = await assign(task.id, { assignee: '' }).expect(400);

    expect(res.body.error).toMatch(/assignee/);
    expect(taskService.findById(task.id).assignee).toBe('Aiman');
  });

  test('returns 400 when assignee is missing', async () => {
    const task = taskService.create({ title: 'a' });
    await assign(task.id, {}).expect(400);
  });

  test('returns 400 when assignee is not a string', async () => {
    const task = taskService.create({ title: 'a' });
    await assign(task.id, { assignee: 123 }).expect(400);
  });

  test('does not change any other field', async () => {
    const task = taskService.create({ title: 'a', status: 'in_progress', priority: 'low' });
    const res = await assign(task.id, { assignee: 'Aiman', status: 'done', title: 'b' }).expect(200);

    expect(res.body).toEqual({ ...task, assignee: 'Aiman' });
  });
});

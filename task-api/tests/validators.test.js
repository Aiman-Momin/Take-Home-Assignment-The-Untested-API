const { validateCreateTask, validateUpdateTask } = require('../src/utils/validators');

describe('validateCreateTask', () => {
  test('accepts a minimal valid body', () => {
    expect(validateCreateTask({ title: 'a' })).toBeNull();
  });

  test('accepts a fully populated valid body', () => {
    expect(
      validateCreateTask({
        title: 'a',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2030-01-01T00:00:00.000Z',
      })
    ).toBeNull();
  });

  test.each([
    ['missing', {}],
    ['empty', { title: '' }],
    ['whitespace only', { title: '   ' }],
    ['not a string', { title: 42 }],
  ])('rejects a %s title', (_label, body) => {
    expect(validateCreateTask(body)).toMatch(/title/);
  });

  test('rejects an invalid status', () => {
    expect(validateCreateTask({ title: 'a', status: 'pending' })).toMatch(/status/);
  });

  test('rejects an invalid priority', () => {
    expect(validateCreateTask({ title: 'a', priority: 'urgent' })).toMatch(/priority/);
  });

  test('rejects an unparseable dueDate', () => {
    expect(validateCreateTask({ title: 'a', dueDate: 'not a date' })).toMatch(/dueDate/);
  });
});

describe('validateUpdateTask', () => {
  test('accepts an empty body (nothing to change)', () => {
    expect(validateUpdateTask({})).toBeNull();
  });

  test('rejects a title explicitly set to empty', () => {
    expect(validateUpdateTask({ title: '' })).toMatch(/title/);
  });

  test('rejects a non-string title', () => {
    expect(validateUpdateTask({ title: null })).toMatch(/title/);
  });

  test('rejects an invalid status', () => {
    expect(validateUpdateTask({ status: 'completed' })).toMatch(/status/);
  });

  test('rejects an invalid priority', () => {
    expect(validateUpdateTask({ priority: 'urgent' })).toMatch(/priority/);
  });

  test('rejects an unparseable dueDate', () => {
    expect(validateUpdateTask({ dueDate: 'soon' })).toMatch(/dueDate/);
  });
});

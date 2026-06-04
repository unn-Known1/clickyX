// Todo Manager — Manage tasks using todo.txt format or local task files
// Usage: { action: "list"|"add"|"done"|"delete"|"search"|"stats", todoFile, text, index }

module.exports = { main };

const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultTodoFile() {
  return process.env.TODO_FILE || path.join(os.homedir(), 'todo.txt');
}

function readTodos(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
}

function writeTodos(filePath, todos) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, todos.join('\n') + '\n', 'utf-8');
}

function parseTodo(line, idx) {
  // todo.txt format: x YYYY-MM-DD (A) YYYY-MM-DD text +project @context
  const done = line.startsWith('x ');
  const clean = done ? line.slice(2) : line;
  const priorityMatch = clean.match(/^\(([A-Z])\) /);
  const priority = priorityMatch ? priorityMatch[1] : null;
  const text = priorityMatch ? clean.slice(4) : clean;
  const projects = [...text.matchAll(/\+(\S+)/g)].map((m) => m[1]);
  const contexts = [...text.matchAll(/@(\S+)/g)].map((m) => m[1]);
  return { index: idx, raw: line, done, priority, text: text.trim(), projects, contexts };
}

async function main(args) {
  const { action, todoFile: fileArg, text, index, project, context, priority } = args || {};
  const todoFile = fileArg || defaultTodoFile();

  try {
    switch (action) {
      case 'list': {
        const todos = readTodos(todoFile);
        const parsed = todos.map((t, i) => parseTodo(t, i + 1));
        const filtered = parsed.filter((t) => {
          if (project && !t.projects.includes(project)) return false;
          if (context && !t.contexts.includes(context)) return false;
          return true;
        });
        const active = filtered.filter((t) => !t.done);
        const done = filtered.filter((t) => t.done);
        return {
          result: `${active.length} active, ${done.length} done`,
          active: active.map((t) => ({ index: t.index, text: t.text, priority: t.priority, projects: t.projects, contexts: t.contexts })),
          done: done.length,
        };
      }

      case 'add': {
        if (!text) return { error: 'Missing text' };
        const todos = readTodos(todoFile);
        const dateStr = new Date().toISOString().slice(0, 10);
        const prioStr = priority ? `(${priority}) ` : '';
        const newTodo = `${prioStr}${dateStr} ${text}`;
        todos.push(newTodo);
        writeTodos(todoFile, todos);
        return { result: 'Task added', index: todos.length, text: newTodo };
      }

      case 'done': {
        if (index === undefined) return { error: 'Missing index' };
        const todos = readTodos(todoFile);
        const idx = Number(index) - 1;
        if (idx < 0 || idx >= todos.length) return { error: `Index ${index} out of range` };
        if (!todos[idx].startsWith('x ')) {
          todos[idx] = `x ${new Date().toISOString().slice(0, 10)} ${todos[idx]}`;
          writeTodos(todoFile, todos);
          return { result: 'Task marked done', index, task: todos[idx] };
        }
        return { result: 'Task already done', index };
      }

      case 'delete': {
        if (index === undefined) return { error: 'Missing index' };
        const todos = readTodos(todoFile);
        const idx = Number(index) - 1;
        if (idx < 0 || idx >= todos.length) return { error: `Index ${index} out of range` };
        const removed = todos.splice(idx, 1)[0];
        writeTodos(todoFile, todos);
        return { result: 'Task deleted', removed };
      }

      case 'search': {
        if (!text) return { error: 'Missing search text' };
        const todos = readTodos(todoFile);
        const q = text.toLowerCase();
        const results = todos.map((t, i) => parseTodo(t, i + 1)).filter((t) => t.text.toLowerCase().includes(q));
        return { result: `${results.length} matching tasks`, tasks: results.map((t) => ({ index: t.index, text: t.text, done: t.done })) };
      }

      case 'stats': {
        const todos = readTodos(todoFile);
        const parsed = todos.map((t, i) => parseTodo(t, i + 1));
        const active = parsed.filter((t) => !t.done);
        const done = parsed.filter((t) => t.done);
        const byPriority = {};
        for (const t of active) {
          const p = t.priority || 'none';
          byPriority[p] = (byPriority[p] || 0) + 1;
        }
        const projects = [...new Set(active.flatMap((t) => t.projects))];
        const contexts = [...new Set(active.flatMap((t) => t.contexts))];
        return { result: 'Stats', total: todos.length, active: active.length, done: done.length, byPriority, projects, contexts };
      }

      default:
        return { error: `Unknown action: ${action}. Use: list, add, done, delete, search, stats` };
    }
  } catch (err) {
    console.error('[todo-manager]', err.message);
    return { error: err.message };
  }
}

// Linear — Create and update Linear issues and projects
// Usage: { action: "list"|"create"|"update"|"get"|"teams", ...params }
// Requires: LINEAR_API_KEY env var

module.exports = { main };

async function linearGql(apiKey, query, variables = {}) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors.map((e) => e.message).join('; '));
  return data.data;
}

async function main(args) {
  const { action, title, description, teamId, issueId, priority, stateId, assigneeId, labels, token: tokenArg } = args || {};
  const apiKey = tokenArg || process.env.LINEAR_API_KEY;
  if (!apiKey) return { error: 'Missing LINEAR_API_KEY' };

  try {
    switch (action) {
      case 'teams': {
        const data = await linearGql(apiKey, `{ teams { nodes { id name key } } }`);
        return { result: 'Teams fetched', teams: data.teams.nodes };
      }

      case 'list': {
        const teamFilter = teamId ? `, filter: { team: { id: { eq: "${teamId}" } } }` : '';
        const data = await linearGql(apiKey, `{ issues(first: 30${teamFilter}) { nodes { id title state { name } priority assignee { name } createdAt } } }`);
        return { result: `${data.issues.nodes.length} issues`, issues: data.issues.nodes };
      }

      case 'get': {
        if (!issueId) return { error: 'Missing issueId' };
        const data = await linearGql(apiKey, `{ issue(id: "${issueId}") { id title description state { name } priority assignee { name } team { name } createdAt } }`);
        return { result: 'Issue fetched', issue: data.issue };
      }

      case 'create': {
        if (!title || !teamId) return { error: 'Missing title or teamId' };
        const data = await linearGql(apiKey, `
          mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id title url } } }
        `, {
          input: {
            title,
            description: description || '',
            teamId,
            priority: priority || 0,
            ...(stateId && { stateId }),
            ...(assigneeId && { assigneeId }),
            ...(labels && { labelIds: labels }),
          },
        });
        const { success, issue } = data.issueCreate;
        return { result: success ? 'Issue created' : 'Creation failed', id: issue?.id, url: issue?.url };
      }

      case 'update': {
        if (!issueId) return { error: 'Missing issueId' };
        const input = {};
        if (title) input.title = title;
        if (description !== undefined) input.description = description;
        if (priority !== undefined) input.priority = priority;
        if (stateId) input.stateId = stateId;
        if (assigneeId) input.assigneeId = assigneeId;
        const data = await linearGql(apiKey, `
          mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id title } } }
        `, { id: issueId, input });
        return { result: data.issueUpdate.success ? 'Issue updated' : 'Update failed', issueId };
      }

      default:
        return { error: `Unknown action: ${action}. Use: teams, list, get, create, update` };
    }
  } catch (err) {
    console.error('[linear]', err.message);
    return { error: err.message };
  }
}

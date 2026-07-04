const API_ROOT = 'https://api.github.com';

export class GitHubSyncError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'GitHubSyncError';
    this.status = status;
    this.data = data;
  }
}

export function isConflictError(error) {
  return error instanceof GitHubSyncError && error.status === 409;
}

export function isNotFoundError(error) {
  return error instanceof GitHubSyncError && error.status === 404;
}

export async function fetchTextFile({ repoFullName, branch, path, secret }) {
  const data = await githubRequest({ repoFullName, branch, path, secret, method: 'GET' });
  if (Array.isArray(data) || data.type !== 'file') {
    throw new GitHubSyncError(`${path} no es un archivo de texto.`, 422, data);
  }
  return {
    content: decodeBase64Utf8(data.content || ''),
    sha: data.sha,
    path: data.path
  };
}

export async function fetchJsonFile(options) {
  const file = await fetchTextFile(options);
  return {
    data: file.content.trim() ? JSON.parse(file.content) : null,
    sha: file.sha,
    path: file.path
  };
}

export async function putTextFile({ repoFullName, branch, path, secret, content, sha, message }) {
  const body = { message, content: encodeBase64Utf8(content), branch };
  if (sha) body.sha = sha;
  const data = await githubRequest({ repoFullName, branch, path, secret, method: 'PUT', body });
  return {
    commitSha: data.commit?.sha ?? null,
    contentSha: data.content?.sha ?? null,
    path: data.content?.path ?? path
  };
}

export function parseNdjson(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

export function toNdjson(records) {
  const lines = (records || []).map(record => JSON.stringify(record));
  return lines.length ? `${lines.join('\n')}\n` : '';
}

async function githubRequest({ repoFullName, branch, path, secret, method, body }) {
  if (!secret) throw new Error('Introduce la clave de GitHub antes de sincronizar.');
  const { owner, repo } = parseRepoFullName(repoFullName);
  const url = new URL(`${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`);
  if (method === 'GET' && branch) url.searchParams.set('ref', branch);

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: ['B', 'earer '].join('') + secret,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GitHubSyncError(data?.message || `GitHub devolvió HTTP ${response.status}.`, response.status, data);
  }
  return data;
}

function parseRepoFullName(repoFullName) {
  const [owner, repo] = String(repoFullName || '').trim().split('/');
  if (!owner || !repo) throw new Error('El repositorio debe tener el formato owner/repo.');
  return { owner, repo };
}

function encodePath(path) {
  return String(path || '').split('/').filter(Boolean).map(part => encodeURIComponent(part)).join('/');
}

function decodeBase64Utf8(base64Text) {
  const binary = atob(String(base64Text || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

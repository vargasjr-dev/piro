interface GitHubContentItem {
  type: "file" | "dir" | string;
  name: string;
  path: string;
  html_url: string;
  download_url: string | null;
  content?: string;
  encoding?: string;
}

interface GitHubRequestOptions {
  owner: string;
  repository: string;
  path: string;
  accessToken?: string | null;
}

interface GitHubRepositorySearchResult {
  name: string;
  owner: { login: string };
}

function githubHeaders(accessToken?: string | null): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function fetchGitHubContents({
  owner,
  repository,
  path,
  accessToken,
}: GitHubRequestOptions): Promise<GitHubContentItem | GitHubContentItem[] | null> {
  const encodedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}`,
    {
      headers: githubHeaders(accessToken),
      cache: "no-store",
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} while reading ${path}`);
  }

  return (await response.json()) as GitHubContentItem | GitHubContentItem[];
}

async function getAuthenticatedGitHubLogin(
  accessToken: string,
): Promise<string | null> {
  const response = await fetch("https://api.github.com/user", {
    headers: githubHeaders(accessToken),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const body = (await response.json()) as { login?: string };
  return body.login ?? null;
}

export interface GitHubRepositoryRef {
  owner: string;
  repository: string;
}

/**
 * Resolve the GitHub repository independently from Piro's app username.
 *
 * Piro usernames and GitHub owners are different identities: for example,
 * the Piro user `dvargasfuertes` owns the GitHub repository under the
 * `vargasjr-dev` organization. Prefer the linked GitHub account, then the
 * Piro username, and finally exact-name GitHub search results.
 */
export async function resolveGitHubRepository(
  piroOwner: string,
  repository: string,
  accessToken?: string | null,
): Promise<GitHubRepositoryRef | null> {
  const candidates: string[] = [];

  if (accessToken) {
    const login = await getAuthenticatedGitHubLogin(accessToken);
    if (login) candidates.push(login);
  }
  candidates.push(piroOwner);

  const searchResponse = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(`${repository} in:name`)}&per_page=20`,
    {
      headers: githubHeaders(accessToken),
      cache: "no-store",
    },
  );

  if (searchResponse.ok) {
    const searchBody = (await searchResponse.json()) as {
      items?: GitHubRepositorySearchResult[];
    };
    for (const result of searchBody.items ?? []) {
      if (result.name.toLowerCase() === repository.toLowerCase()) {
        candidates.push(result.owner.login);
      }
    }
  }

  const uniqueCandidates = [...new Set(candidates)];
  let firstExactMatch: GitHubRepositoryRef | null = null;

  for (const owner of uniqueCandidates) {
    const ref = { owner, repository };
    const contents = await fetchGitHubContents({
      ...ref,
      path: "architectures",
      accessToken,
    });

    if (contents === null) continue;
    firstExactMatch ??= ref;

    // Prefer the exact repo that actually contains the component directory.
    if (Array.isArray(contents)) return ref;
  }

  return firstExactMatch;
}

export interface RepositoryArchitecture {
  name: string;
  path: string;
  htmlUrl: string;
}

export async function listRepositoryArchitectures(
  owner: string,
  repository: string,
  accessToken?: string | null,
): Promise<RepositoryArchitecture[]> {
  const contents = await fetchGitHubContents({
    owner,
    repository,
    path: "architectures",
    accessToken,
  });

  if (!Array.isArray(contents)) return [];

  return contents
    .filter(
      (item) =>
        item.type === "dir" &&
        !item.name.startsWith(".") &&
        item.name !== "__pycache__",
    )
    .map((item) => ({
      name: item.name,
      path: item.path,
      htmlUrl: item.html_url,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface RepositoryArchitectureFile {
  name: string;
  path: string;
  htmlUrl: string;
  source: string | null;
}

export async function getRepositoryArchitecture(
  owner: string,
  repository: string,
  name: string,
  accessToken?: string | null,
): Promise<RepositoryArchitectureFile | null> {
  const path = `architectures/${name}/main.py`;
  const contents = await fetchGitHubContents({
    owner,
    repository,
    path,
    accessToken,
  });

  if (!contents || Array.isArray(contents) || contents.type !== "file") {
    return null;
  }

  const source =
    contents.encoding === "base64" && contents.content
      ? Buffer.from(contents.content.replace(/\n/g, ""), "base64").toString("utf8")
      : null;

  return {
    name,
    path,
    htmlUrl: contents.html_url,
    source,
  };
}

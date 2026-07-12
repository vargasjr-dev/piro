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
  signal?: AbortSignal;
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

  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

async function fetchGitHubContents({
  owner,
  repository,
  path,
  accessToken,
  signal,
}: GitHubRequestOptions): Promise<
  GitHubContentItem | GitHubContentItem[] | null
> {
  const suffix = path
    ? `/${path
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/")}`
    : "";
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents${suffix}`,
    { headers: githubHeaders(accessToken), cache: "no-store", signal },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `GitHub returned ${response.status} while reading ${path || "repository root"}`,
    );
  }
  return (await response.json()) as GitHubContentItem | GitHubContentItem[];
}

async function getAuthenticatedGitHubLogin(
  accessToken: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await fetch("https://api.github.com/user", {
    headers: githubHeaders(accessToken),
    cache: "no-store",
    signal,
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { login?: string };
  return body.login ?? null;
}

export interface GitHubRepositoryRef {
  owner: string;
  repository: string;
}

export async function resolveGitHubRepository(
  piroOwner: string,
  repository: string,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<GitHubRepositoryRef | null> {
  const candidates: string[] = [];
  if (accessToken) {
    const login = await getAuthenticatedGitHubLogin(accessToken, signal);
    if (login) candidates.push(login);
  }
  candidates.push(piroOwner);

  const searchResponse = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(`${repository} in:name`)}&per_page=20`,
    { headers: githubHeaders(accessToken), cache: "no-store", signal },
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

  for (const owner of [...new Set(candidates)]) {
    const ref = { owner, repository };
    if (await fetchGitHubContents({ ...ref, path: "", accessToken, signal })) {
      return ref;
    }
  }
  return null;
}

export interface GitHubRepositoryComponent {
  name: string;
  path: string;
  htmlUrl: string;
  entrypoint: string | null;
}

const COMPONENT_ENTRYPOINTS = ["main.py", "model.py", "script.py"];

export async function listRepositoryDirectory(
  owner: string,
  repository: string,
  directory: string,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<GitHubRepositoryComponent[]> {
  const contents = await fetchGitHubContents({
    owner,
    repository,
    path: directory,
    accessToken,
    signal,
  });
  if (!Array.isArray(contents)) return [];

  const components = await Promise.all(
    contents
      .filter(
        (item) =>
          item.type === "dir" &&
          !item.name.startsWith(".") &&
          item.name !== "__pycache__",
      )
      .map(async (item) => {
        const candidates = await Promise.all(
          COMPONENT_ENTRYPOINTS.map(async (entrypoint) => {
            const file = await fetchGitHubContents({
              owner,
              repository,
              path: `${item.path}/${entrypoint}`,
              accessToken,
              signal,
            });
            return file && !Array.isArray(file) && file.type === "file"
              ? entrypoint
              : null;
          }),
        );
        return {
          name: item.name,
          path: item.path,
          htmlUrl: item.html_url,
          entrypoint: candidates.find(Boolean) ?? null,
        };
      }),
  );
  return components.sort((a, b) => a.name.localeCompare(b.name));
}

export interface RepositoryArchitecture extends GitHubRepositoryComponent {}

export async function listRepositoryArchitectures(
  owner: string,
  repository: string,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<RepositoryArchitecture[]> {
  return listRepositoryDirectory(
    owner,
    repository,
    "architectures",
    accessToken,
    signal,
  );
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
  signal?: AbortSignal,
): Promise<RepositoryArchitectureFile | null> {
  for (const entrypoint of COMPONENT_ENTRYPOINTS) {
    const path = `architectures/${name}/${entrypoint}`;
    const contents = await fetchGitHubContents({
      owner,
      repository,
      path,
      accessToken,
      signal,
    });
    if (!contents || Array.isArray(contents) || contents.type !== "file")
      continue;

    const source =
      contents.encoding === "base64" && contents.content
        ? Buffer.from(contents.content.replace(/\n/g, ""), "base64").toString(
            "utf8",
          )
        : null;
    return { name, path, htmlUrl: contents.html_url, source };
  }
  return null;
}

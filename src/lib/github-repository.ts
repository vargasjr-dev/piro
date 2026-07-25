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
}: GitHubRequestOptions): Promise<GitHubContentItem | GitHubContentItem[] | null> {
  const suffix = path
    ? `/${path.split("/").map(encodeURIComponent).join("/")}`
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

export interface GitHubRepositoryRef {
  owner: string;
  repository: string;
}

export function parseGitHubRepositoryRef(value: string): GitHubRepositoryRef | null {
  const input = value.trim();
  if (!input) return null;
  const candidate = input.includes("://") ? input : `https://github.com/${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const repository = parts[1].replace(/\.git$/, "");
  if (!parts[0] || !repository) return null;
  return { owner: parts[0], repository };
}

export function githubRepositoryUrl({ owner, repository }: GitHubRepositoryRef): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
}

export type RepositoryComponentKind = "architectures" | "benchmarks" | "sources";

export interface GitHubRepositoryComponent {
  name: string;
  path: string;
  htmlUrl: string;
  entrypoint: string | null;
}

const COMPONENT_ENTRYPOINTS = ["main.py", "model.py", "script.py"];

async function listComponentDirectory(
  owner: string,
  repository: string,
  directory: string,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<GitHubRepositoryComponent[]> {
  const contents = await fetchGitHubContents({ owner, repository, path: directory, accessToken, signal });
  if (!Array.isArray(contents)) return [];

  return Promise.all(
    contents
      .filter((item) => item.type === "dir" && !item.name.startsWith(".") && item.name !== "__pycache__")
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
            return file && !Array.isArray(file) && file.type === "file" ? entrypoint : null;
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
}

export async function listRepositoryDirectory(
  owner: string,
  repository: string,
  directory: string,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<GitHubRepositoryComponent[]> {
  const components = await listComponentDirectory(owner, repository, directory, accessToken, signal);
  return components.sort((a, b) => a.path.localeCompare(b.path));
}

export type RepositoryArchitecture = GitHubRepositoryComponent;

export async function listRepositoryArchitectures(
  owner: string,
  repository: string,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<GitHubRepositoryComponent[]> {
  return listRepositoryDirectory(owner, repository, "architectures", accessToken, signal);
}

export interface RepositoryComponentFile {
  name: string;
  path: string;
  htmlUrl: string;
  entrypoint: string;
  source: string | null;
}

function componentPath(kind: RepositoryComponentKind, name: string): string {
  if (name.startsWith(`${kind}/`)) return name;
  return `${kind}/${name}`;
}

export async function getRepositoryComponent(
  owner: string,
  repository: string,
  kind: RepositoryComponentKind,
  name: string,
  accessToken?: string | null,
  signal?: AbortSignal,
  sourcePath?: string,
): Promise<RepositoryComponentFile | null> {
  const basePath = sourcePath ?? componentPath(kind, name);
  for (const entrypoint of COMPONENT_ENTRYPOINTS) {
    const contents = await fetchGitHubContents({
      owner,
      repository,
      path: `${basePath}/${entrypoint}`,
      accessToken,
      signal,
    });
    if (!contents || Array.isArray(contents) || contents.type !== "file") continue;
    const source =
      contents.encoding === "base64" && contents.content
        ? Buffer.from(contents.content.replace(/\n/g, ""), "base64").toString("utf8")
        : null;
    const parts = basePath.split("/");
    return {
      name: parts.at(-1) ?? name,
      path: basePath,
      htmlUrl: contents.html_url,
      entrypoint,
      source,
    };
  }
  return null;
}

export interface RepositoryArchitectureFile extends RepositoryComponentFile {}

export async function getRepositoryArchitecture(
  owner: string,
  repository: string,
  name: string,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<RepositoryArchitectureFile | null> {
  return getRepositoryComponent(owner, repository, "architectures", name, accessToken, signal);
}

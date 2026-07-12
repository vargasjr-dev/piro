import {
  listRepositoryDirectory,
  type GitHubRepositoryComponent,
} from "~/lib/github-repository";

export type RepositoryComponentKind =
  | "architectures"
  | "benchmarks"
  | "sources";

export type RepositoryComponent = GitHubRepositoryComponent & {
  kind: RepositoryComponentKind;
};

export async function listRepositoryComponents(
  owner: string,
  repository: string,
  kind: RepositoryComponentKind,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<RepositoryComponent[]> {
  const components = await listRepositoryDirectory(
    owner,
    repository,
    kind,
    accessToken,
    signal,
  );
  return components.map((component) => ({ ...component, kind }));
}

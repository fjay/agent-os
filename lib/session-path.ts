import type { Session, Project } from "@/lib/db";

type ProjectLike = Pick<Project, "working_directory"> | null | undefined;
type SessionLike =
  | Pick<Session, "working_directory" | "worktree_path">
  | null
  | undefined;

export function getEffectiveWorkingDirectory(
  session: SessionLike,
  project?: ProjectLike
): string | null {
  if (!session) return null;
  return (
    session.worktree_path ||
    project?.working_directory ||
    session.working_directory
  );
}

export function resolveFilePath(
  filePath: string,
  workingDirectory?: string | null
): string {
  if (
    !workingDirectory ||
    filePath.startsWith("/") ||
    filePath.startsWith("~")
  ) {
    return filePath;
  }

  const normalizedDirectory = workingDirectory.replace(/\/$/, "");
  const normalizedPath = filePath.replace(/^\.\//, "");

  return `${normalizedDirectory}/${normalizedPath}`;
}

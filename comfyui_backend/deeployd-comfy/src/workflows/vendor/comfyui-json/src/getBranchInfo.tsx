import { z } from "zod";

const RepoSchema = z.object({
  default_branch: z.string(),
});
const BranchInfoSchema = z.object({
  commit: z.object({
    sha: z.string(),
  }),
});
function extractRepoName(repoUrl: string) {
  const url = new URL(repoUrl);
  const pathParts = url.pathname.split("/");
  const repoName = pathParts[2].replace(".git", "");
  const author = pathParts[1];
  return `${author}/${repoName}`;
}
export async function getBranchInfo(gitUrl: string) {
  const repoName = extractRepoName(gitUrl);
  console.log(`Fetching repo info... ${gitUrl}`);
  const repo = await fetch(`https://api.github.com/repos/${repoName}`)
    .then((x) => x.json())
    .then((x) => {
      // console.log(x);
      return x;
    })
    .then((x) => RepoSchema.parse(x))
    .catch((e) => {
      // console.error(e);
      // console.log(`Failed to fetch repo info ${e.message}`);
      console.log(`Failed to fetch repo info (probably rate limited)`);
      return null;
    });

  if (!repo) return;
  const branch = repo.default_branch;
  const branchInfo = await fetch(
    `https://api.github.com/repos/${repoName}/branches/${branch}`,
  )
    .then((x) => x.json())
    .then((x) => {
      // console.log(x);
      return x;
    })
    .then((x) => BranchInfoSchema.parse(x))
    .catch((e) => {
      // console.error(e);
      console.log(`Failed to fetch branch info ${e.message}`);
      return null;
    });

  return branchInfo;
}

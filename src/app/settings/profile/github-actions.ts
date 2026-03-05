'use server'

import githubService from "@/server/services/github.service";
import userService from "@/server/services/user.service";
import { getAuthUserSession, simpleAction } from "@/server/utils/action-wrapper.utils";

export const getGitHubRepos = async () =>
  simpleAction(async () => {
    const session = await getAuthUserSession();
    const user = await userService.getUserByEmail(session.email);
    
    if (!user.githubAccessToken) {
      throw new Error('GitHub account not connected');
    }
    
    return await githubService.getUserRepos(user.githubAccessToken);
  });

export const getGitHubBranches = async (owner: string, repo: string) =>
  simpleAction(async () => {
    const session = await getAuthUserSession();
    const user = await userService.getUserByEmail(session.email);
    
    if (!user.githubAccessToken) {
      throw new Error('GitHub account not connected');
    }
    
    return await githubService.getRepoBranches(user.githubAccessToken, owner, repo);
  });

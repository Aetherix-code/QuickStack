import { Octokit } from '@octokit/rest';

export interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    html_url: string;
    description: string | null;
    clone_url: string;
    default_branch: string;
    updated_at: string;
}

export interface GitHubBranch {
    name: string;
    protected: boolean;
}

class GitHubService {

    async getUserRepos(accessToken: string): Promise<GitHubRepo[]> {
        const octokit = new Octokit({ auth: accessToken });

        // Fetch repos the user has direct access to
        const userRepos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
            sort: 'updated',
            per_page: 100,
            affiliation: 'owner,collaborator,organization_member'
        });

        // Also fetch repos from each org the user belongs to
        const orgs = await octokit.paginate(octokit.orgs.listForAuthenticatedUser, {
            per_page: 100,
        });

        const orgRepos = (await Promise.all(
            orgs.map(org =>
                octokit.paginate(octokit.repos.listForOrg, {
                    org: org.login,
                    per_page: 100,
                    sort: 'updated',
                }).catch(() => []) // Skip orgs where access is denied
            )
        )).flat();

        // Deduplicate by repo id
        const repoMap = new Map<number, GitHubRepo>();
        for (const repo of [...userRepos, ...orgRepos]) {
            repoMap.set(repo.id, repo as GitHubRepo);
        }

        return Array.from(repoMap.values());
    }

    async getRepoBranches(accessToken: string, owner: string, repo: string): Promise<GitHubBranch[]> {
        const octokit = new Octokit({ auth: accessToken });

        // Fetch all pages of branches
        const allBranches: GitHubBranch[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const { data } = await octokit.repos.listBranches({
                owner,
                repo,
                per_page: 100,
                page: page
            });

            allBranches.push(...(data as GitHubBranch[]));

            // If we got less than 100 results, we've reached the last page
            hasMore = data.length === 100;
            page++;
        }

        return allBranches;
    }

    async createWebhook(accessToken: string, owner: string, repo: string, webhookUrl: string): Promise<number> {
        const octokit = new Octokit({ auth: accessToken });

        const { data } = await octokit.repos.createWebhook({
            owner,
            repo,
            config: {
                url: webhookUrl,
                content_type: 'json',
                insecure_ssl: '0'
            },
            events: ['push'],
            active: true
        });

        return data.id;
    }

    async deleteWebhook(accessToken: string, owner: string, repo: string, webhookId: number): Promise<void> {
        const octokit = new Octokit({ auth: accessToken });

        await octokit.repos.deleteWebhook({
            owner,
            repo,
            hook_id: webhookId
        });
    }

    async getWebhooks(accessToken: string, owner: string, repo: string): Promise<any[]> {
        const octokit = new Octokit({ auth: accessToken });

        // Fetch all pages of webhooks
        const allWebhooks: any[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const { data } = await octokit.repos.listWebhooks({
                owner,
                repo,
                per_page: 100,
                page: page
            });

            allWebhooks.push(...data);

            // If we got less than 100 results, we've reached the last page
            hasMore = data.length === 100;
            page++;
        }

        return allWebhooks;
    }

    parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
        // Parse GitHub URLs like: https://github.com/owner/repo or git@github.com:owner/repo.git
        const httpsMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
        const sshMatch = repoUrl.match(/github\.com:([^\/]+)\/([^\/\.]+)/);

        const match = httpsMatch || sshMatch;
        if (match) {
            return {
                owner: match[1],
                repo: match[2].replace('.git', '')
            };
        }

        return null;
    }
}

const githubService = new GitHubService();
export default githubService;

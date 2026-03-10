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

        const { data } = await octokit.repos.listForAuthenticatedUser({
            sort: 'updated',
            per_page: 100,
            affiliation: 'owner,collaborator,organization_member'
        });

        return data as GitHubRepo[];
    }

    async getRepoBranches(accessToken: string, owner: string, repo: string): Promise<GitHubBranch[]> {
        const octokit = new Octokit({ auth: accessToken });

        const { data } = await octokit.repos.listBranches({
            owner,
            repo,
            per_page: 100
        });

        return data as GitHubBranch[];
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

        const { data } = await octokit.repos.listWebhooks({
            owner,
            repo
        });

        return data;
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

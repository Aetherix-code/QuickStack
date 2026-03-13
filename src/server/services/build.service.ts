import { AppExtendedModel } from "@/shared/model/app-extended.model";
import k3s from "../adapter/kubernetes-api.adapter";
import { V1Job, V1JobStatus } from "@kubernetes/client-node";
import { KubeObjectNameUtils } from "../utils/kube-object-name.utils";
import { BuildJobModel } from "@/shared/model/build-job";
import { ServiceException } from "@/shared/model/service.exception.model";
import { PodsInfoModel } from "@/shared/model/pods-info.model";
import namespaceService from "./namespace.service";
import { Constants } from "../../shared/utils/constants";
import gitService from "./git.service";
import { dlog } from "./deployment-logs.service";
import podService from "./pod.service";
import stream from "stream";
import { PathUtils } from "../utils/path.utils";
import registryService, { BUILD_NAMESPACE } from "./registry.service";
import paramService, { ParamService } from "./param.service";
import userService from "./user.service";

const buildkitImage = "moby/buildkit:master";
const railpackFrontendImage = "ghcr.io/railwayapp/railpack-frontend:latest";
const railpackVersion = "v0.18.0";

function isGitHubUrl(gitUrl: string): boolean {
    return /^https?:\/\/([^/]+@)?(github\.com|api\.github\.com)/.test(gitUrl) || gitUrl.includes('github.com');
}

async function resolveGitUrlWithUserToken(app: AppExtendedModel, userEmail?: string | null): Promise<string | undefined> {
    console.log('[resolveGitUrlWithUserToken] userEmail:', userEmail);
    console.log('[resolveGitUrlWithUserToken] app.gitUrl:', app.gitUrl);
    console.log('[resolveGitUrlWithUserToken] isGitHubUrl:', isGitHubUrl(app.gitUrl || ''));
    
    if (!userEmail || !app.gitUrl || !isGitHubUrl(app.gitUrl)) {
        console.log('[resolveGitUrlWithUserToken] Early return: missing userEmail, gitUrl, or not GitHub');
        return undefined;
    }
    const user = await userService.getUserByEmail(userEmail);
    console.log('[resolveGitUrlWithUserToken] user.githubAccessToken exists:', !!user.githubAccessToken);
    console.log('[resolveGitUrlWithUserToken] user.githubUsername:', user.githubUsername);
    
    if (!user.githubAccessToken) {
        console.log('[resolveGitUrlWithUserToken] No GitHub token found for user');
        return undefined;
    }
    const username = user.githubUsername || 'git';
    // Strip any existing auth from URL (e.g. https://user@github.com/...) then add token
    const base = app.gitUrl.replace(/^https?:\/\/[^/]*@/, 'https://');
    const resolvedUrl = base.replace(/^https?:\/\//, `https://${encodeURIComponent(username)}:${encodeURIComponent(user.githubAccessToken)}@`);
    console.log('[resolveGitUrlWithUserToken] Resolved URL with token (redacted)');
    return resolvedUrl;
}

class BuildService {

    async buildApp(deploymentId: string, app: AppExtendedModel, forceBuild: boolean = false, userEmail?: string | null): Promise<[string, string, Promise<void>]> {
        await namespaceService.createNamespaceIfNotExists(BUILD_NAMESPACE);
        const registryLocation = await paramService.getString(ParamService.REGISTRY_SOTRAGE_LOCATION, Constants.INTERNAL_REGISTRY_LOCATION);
        await registryService.deployRegistry(registryLocation!);
        const buildsForApp = await this.getBuildsForApp(app.id);
        if (buildsForApp.some((job) => job.status === 'RUNNING')) {
            throw new ServiceException("A build job is already running for this app.");
        }

        dlog(deploymentId, `Initialized app build...`);
        dlog(deploymentId, `Trying to clone repository...`);

        const resolvedGitUrl = await resolveGitUrlWithUserToken(app, userEmail);
        if (resolvedGitUrl && isGitHubUrl(app.gitUrl!)) {
            await dlog(deploymentId, `Using connected GitHub account for private repo access.`);
        }

        // Check if last build is already up to date with data in git repo
        const latestSuccessfulBuld = buildsForApp.find(x => x.status === 'SUCCEEDED');
        const latestRemoteGitHash = app.buildMethod === 'AUTO'
            ? await gitService.getRemoteCommitHash(app, app.gitBranch ?? 'main', resolvedGitUrl)
            : await gitService.openGitContext(app, async (ctx) => {
                await ctx.checkIfDockerfileExists();
                return await ctx.getLatestRemoteCommitHash();
            }, resolvedGitUrl);

        dlog(deploymentId, `Cloned repository successfully`);
        dlog(deploymentId, `Latest remote git hash: ${latestRemoteGitHash}`);

        if (!forceBuild && latestSuccessfulBuld?.gitCommit && latestRemoteGitHash &&
            latestSuccessfulBuld?.gitCommit === latestRemoteGitHash) {

            if (await registryService.doesImageExist(app.id, 'latest')) {
                await dlog(deploymentId, `Latest build is already up to date with git repository, using container from last build.`);
                return [latestSuccessfulBuld.name, latestRemoteGitHash, Promise.resolve()];
            } else {
                await dlog(deploymentId, `Docker Image for last build not found in internal registry, creating new build.`);
            }
        }
        return await this.createAndStartBuildJob(deploymentId, app, latestRemoteGitHash, resolvedGitUrl);
    }

    private async createAndStartBuildJob(deploymentId: string, app: AppExtendedModel, latestRemoteGitHash: string, resolvedGitUrl?: string): Promise<[string, string, Promise<void>]> {
        const buildName = KubeObjectNameUtils.addRandomSuffix(KubeObjectNameUtils.toJobName(app.id));

        dlog(deploymentId, `Creating build job with name: ${buildName}`);

        const jobDefinition =
            app.buildMethod === 'AUTO'
                ? this.createAutoBuildJob(deploymentId, app, buildName, latestRemoteGitHash, resolvedGitUrl)
                : this.createDockerfileBuildJob(deploymentId, app, buildName, latestRemoteGitHash, resolvedGitUrl);

        await k3s.batch.createNamespacedJob(BUILD_NAMESPACE, jobDefinition);

        await dlog(deploymentId, `Build job ${buildName} started successfully`);

        await new Promise(resolve => setTimeout(resolve, 5000)); // wait to be sure that pod is created
        await this.logBuildOutput(deploymentId, buildName);

        const buildJobPromise = this.waitForJobCompletion(jobDefinition.metadata!.name!);

        return [buildName, latestRemoteGitHash, buildJobPromise];
    }

    private createDockerfileBuildJob(deploymentId: string, app: AppExtendedModel, buildName: string, latestRemoteGitHash: string, resolvedGitUrl?: string): V1Job {
        const contextPaths = PathUtils.splitPath(app.dockerfilePath);

        const baseGitUrl = resolvedGitUrl ?? (app.gitUsername && app.gitToken
            ? app.gitUrl!.replace('https://', `https://${app.gitUsername}:${app.gitToken}@`)
            : app.gitUrl!);
        const gitContextUrl = `${baseGitUrl}#refs/heads/${app.gitBranch}${contextPaths.folderPath ? ':' + contextPaths.folderPath : ''}`;

        const buildkitArgs = [
            "build",
            "--frontend",
            "dockerfile.v0",
            "--opt",
            `filename=${contextPaths.filePath}`,
            "--opt",
            `context=${gitContextUrl}`,
            "--output",
            `type=image,name=${registryService.createInternalContainerRegistryUrlForAppId(app.id)},push=true,registry.insecure=true`
        ];

        dlog(deploymentId, `Dockerfile context path: ${contextPaths.folderPath ?? 'root directory of Git Repository'}. Dockerfile name: ${contextPaths.filePath}`);

        return {
            apiVersion: "batch/v1",
            kind: "Job",
            metadata: {
                name: buildName,
                namespace: BUILD_NAMESPACE,
                annotations: {
                    [Constants.QS_ANNOTATION_APP_ID]: app.id,
                    [Constants.QS_ANNOTATION_PROJECT_ID]: app.projectId,
                    [Constants.QS_ANNOTATION_GIT_COMMIT]: latestRemoteGitHash,
                    [Constants.QS_ANNOTATION_DEPLOYMENT_ID]: deploymentId,
                }
            },
            spec: {
                ttlSecondsAfterFinished: 86400,
                template: {
                    spec: {
                        hostUsers: false,
                        containers: [
                            {
                                name: buildName,
                                image: buildkitImage,
                                command: ["buildctl-daemonless.sh"],
                                args: buildkitArgs,
                                securityContext: { privileged: true }
                            },
                        ],
                        restartPolicy: "Never",
                    },
                },
                backoffLimit: 0,
            },
        };
    }

    private createAutoBuildJob(deploymentId: string, app: AppExtendedModel, buildName: string, latestRemoteGitHash: string, resolvedGitUrl?: string): V1Job {
        const gitUrl = resolvedGitUrl ?? (app.gitUsername && app.gitToken
            ? app.gitUrl!.replace('https://', `https://${app.gitUsername}:${app.gitToken}@`)
            : app.gitUrl!);
        const contextPaths = PathUtils.splitPath(app.dockerfilePath);
        const contextSubdir = (contextPaths.folderPath || '').replace(/^\.\/?/, '');
        const branch = app.gitBranch || 'main';

        const contextPath = contextSubdir ? `/workspace/repo/${contextSubdir}` : '/workspace/repo';

        // Clone repo and run railpack prepare to generate plan (using Debian for mise compatibility)
        const initScript = [
            'set -e',
            'apt-get update && apt-get install -y git curl ca-certificates',
            'ARCH=$(uname -m)',
            'case "$ARCH" in aarch64|arm64) ARCH="arm64";; x86_64|amd64) ARCH="x86_64";; esac',
            `curl -sL "https://github.com/railwayapp/railpack/releases/download/${railpackVersion}/railpack-${railpackVersion}-\${ARCH}-unknown-linux-musl.tar.gz" | tar xz -C /usr/local/bin`,
            'git clone --depth 1 --single-branch --branch "$GIT_BRANCH" "$GIT_URL" /workspace/repo',
            `cd ${contextPath}`,
            'railpack prepare . --plan-out railpack-plan.json',
        ].join(' && ');

        // Railpack frontend uses the generated plan file from the dockerfile context
        const buildkitArgs = [
            "build",
            "--frontend", "gateway.v0",
            "--opt", `source=${railpackFrontendImage}`,
            "--local", `context=${contextPath}`,
            "--local", `dockerfile=${contextPath}`,
            "--output",
            `type=image,name=${registryService.createInternalContainerRegistryUrlForAppId(app.id)},push=true,registry.insecure=true`,
        ];

        dlog(deploymentId, `Auto build (Railpack): context ${contextPath}`);

        return {
            apiVersion: "batch/v1",
            kind: "Job",
            metadata: {
                name: buildName,
                namespace: BUILD_NAMESPACE,
                annotations: {
                    [Constants.QS_ANNOTATION_APP_ID]: app.id,
                    [Constants.QS_ANNOTATION_PROJECT_ID]: app.projectId,
                    [Constants.QS_ANNOTATION_GIT_COMMIT]: latestRemoteGitHash,
                    [Constants.QS_ANNOTATION_DEPLOYMENT_ID]: deploymentId,
                }
            },
            spec: {
                ttlSecondsAfterFinished: 86400,
                template: {
                    spec: {
                        initContainers: [
                            {
                                name: `${buildName}-clone`,
                                image: "debian:12-slim",
                                command: ["/bin/bash", "-c", initScript],
                                env: [
                                    { name: "GIT_URL", value: gitUrl },
                                    { name: "GIT_BRANCH", value: branch },
                                ],
                                volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
                            },
                        ],
                        containers: [
                            {
                                name: buildName,
                                image: buildkitImage,
                                command: ["buildctl-daemonless.sh"],
                                args: buildkitArgs,
                                securityContext: { privileged: true },
                                volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
                            },
                        ],
                        volumes: [{ name: "workspace", emptyDir: {} }],
                        restartPolicy: "Never",
                    },
                },
                backoffLimit: 0,
            },
        };
    }

    async logBuildOutput(deploymentId: string, buildName: string) {

        const pod = await this.getPodForJob(buildName);
        await podService.waitUntilPodIsRunningFailedOrSucceded(BUILD_NAMESPACE, pod.podName);

        // Extra delay so the main container log endpoint is ready (pods with init containers can race)
        await new Promise(resolve => setTimeout(resolve, 5000));

        const maxLogRetries = 10;
        const logRetryDelayMs = 5000;
        let logStream: stream.PassThrough | null = null;
        let lastErr: unknown;
        for (let attempt = 1; attempt <= maxLogRetries; attempt++) {
            logStream = new stream.PassThrough();
            try {
                await k3s.log.log(BUILD_NAMESPACE, pod.podName, pod.containerName, logStream, {
                    follow: true,
                    tailLines: undefined,
                    timestamps: true,
                    pretty: false,
                    previous: false
                });
                lastErr = undefined;
                break;
            } catch (err: unknown) {
                lastErr = err;
                if (attempt < maxLogRetries) {
                    const msg = String((err as { body?: { message?: string }; response?: { body?: { message?: string } }; message?: string })?.body?.message
                        ?? (err as { response?: { body?: { message?: string } } })?.response?.body?.message
                        ?? (err as Error)?.message ?? '');
                    await dlog(deploymentId, `Waiting for build container logs (attempt ${attempt}/${maxLogRetries})${msg ? `: ${msg.slice(0, 120)}` : ''}...`);
                    await new Promise(resolve => setTimeout(resolve, logRetryDelayMs));
                    continue;
                }
                throw err;
            }
        }
        if (lastErr) {
            throw lastErr;
        }

        const streamToUse = logStream!;
        streamToUse.on('data', async (chunk) => {
            await dlog(deploymentId, chunk.toString(), false, false);
        });

        streamToUse.on('error', async (error) => {
            console.error("Error in build log stream for deployment " + deploymentId, error);
            await dlog(deploymentId, '[ERROR] An unexpected error occurred while streaming logs.');
        });

        streamToUse.on('end', async () => {
            console.log(`[END] Log stream ended for build process: ${buildName}`);
            await dlog(deploymentId, `[END] Log stream ended for build process: ${buildName}`);
        });
    }


    async deleteAllBuildsOfApp(appId: string) {
        const jobNamePrefix = KubeObjectNameUtils.toJobName(appId);
        const jobs = await k3s.batch.listNamespacedJob(BUILD_NAMESPACE);
        const jobsOfBuild = jobs.body.items.filter((job) => job.metadata?.name?.startsWith(jobNamePrefix));
        for (const job of jobsOfBuild) {
            await this.deleteBuild(job.metadata?.name!);
        }
    }

    async deleteAllFailedOrSuccededBuilds() {
        const jobs = await k3s.batch.listNamespacedJob(BUILD_NAMESPACE);
        const jobsToDelete = jobs.body.items.filter((job) => {
            const status = this.getJobStatusString(job.status);
            return !status || status !== 'RUNNING';
        });
        for (const job of jobsToDelete) {
            await this.deleteBuild(job.metadata?.name!);
        }
    }

    async deleteAllBuildsOfProject(projectId: string) {
        const jobs = await k3s.batch.listNamespacedJob(BUILD_NAMESPACE);
        const jobsOfProject = jobs.body.items.filter((job) => job.metadata?.annotations?.[Constants.QS_ANNOTATION_PROJECT_ID] === projectId);
        for (const job of jobsOfProject) {
            await this.deleteBuild(job.metadata?.name!);
        }
    }

    async getBuildByName(buildName: string) {
        const jobs = await k3s.batch.listNamespacedJob(BUILD_NAMESPACE);
        return jobs.body.items.find((job) => job.metadata?.name === buildName);
    }

    async getAppIdByBuildName(buildName: string) {
        const job = await this.getBuildByName(buildName);
        if (!job) {
            throw new ServiceException(`No build found with name ${buildName}`);
        }
        const appId = job.metadata?.annotations?.[Constants.QS_ANNOTATION_APP_ID];
        if (!appId) {
            throw new ServiceException(`No appId found for build ${buildName}`);
        }
        return appId;
    }

    async deleteBuild(buildName: string) {
        await k3s.batch.deleteNamespacedJob(buildName, BUILD_NAMESPACE);
        console.log(`Deleted build job ${buildName}`);
    }

    async getBuildsForApp(appId: string) {
        const jobNamePrefix = KubeObjectNameUtils.toJobName(appId);
        const jobs = await k3s.batch.listNamespacedJob(BUILD_NAMESPACE);
        const jobsOfBuild = jobs.body.items.filter((job) => job.metadata?.name?.startsWith(jobNamePrefix));
        const builds = jobsOfBuild.map((job) => {
            return {
                name: job.metadata?.name,
                startTime: job.status?.startTime,
                status: this.getJobStatusString(job.status),
                gitCommit: job.metadata?.annotations?.[Constants.QS_ANNOTATION_GIT_COMMIT],
                deploymentId: job.metadata?.annotations?.[Constants.QS_ANNOTATION_DEPLOYMENT_ID],
            } as BuildJobModel;
        });
        builds.sort((a, b) => {
            if (a.startTime && b.startTime) {
                return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
            }
            return 0;
        });
        return builds;
    }


    async getPodForJob(jobName: string) {
        const res = await k3s.core.listNamespacedPod(BUILD_NAMESPACE, undefined, undefined, undefined, undefined, `job-name=${jobName}`);
        const jobs = res.body.items;
        if (jobs.length === 0) {
            throw new ServiceException(`No pod found for job ${jobName}`);
        }
        const pod = jobs[0];
        return {
            podName: pod.metadata?.name!,
            containerName: pod.spec?.containers?.[0].name!
        } as PodsInfoModel;
    }

    async waitForJobCompletion(jobName: string) {
        const POLL_INTERVAL = 10000; // 10 seconds
        return await new Promise<void>((resolve, reject) => {
            const intervalId = setInterval(async () => {
                try {
                    const jobStatus = await this.getJobStatus(jobName);
                    if (jobStatus === 'UNKNOWN') {
                        console.log(`Job ${jobName} not found.`);
                        clearInterval(intervalId);
                        reject(new Error(`Job ${jobName} not found.`));
                        return;
                    }
                    if (jobStatus === 'SUCCEEDED') {
                        clearInterval(intervalId);
                        console.log(`Job ${jobName} completed successfully.`);
                        resolve();
                    } else if (jobStatus === 'FAILED') {
                        clearInterval(intervalId);
                        console.log(`Job ${jobName} failed.`);
                        reject(new Error(`Job ${jobName} failed.`));
                    } else {
                        console.log(`Job ${jobName} is still running...`);
                    }
                } catch (err) {
                    clearInterval(intervalId);
                    reject(err);
                }
            }, POLL_INTERVAL);
        });
    }

    async getJobStatus(buildName: string): Promise<'UNKNOWN' | 'RUNNING' | 'FAILED' | 'SUCCEEDED'> {
        try {
            const response = await k3s.batch.readNamespacedJobStatus(buildName, BUILD_NAMESPACE);
            const status = response.body.status;
            return this.getJobStatusString(status);
        } catch (err) {
            console.error(err);
        }
        return 'UNKNOWN';
    }

    getJobStatusString(status?: V1JobStatus) {
        if (!status) {
            return 'UNKNOWN';
        }
        if ((status.active ?? 0) > 0) {
            return 'RUNNING';
        }
        if ((status.succeeded ?? 0) > 0) {
            return 'SUCCEEDED';
        }
        if ((status.failed ?? 0) > 0) {
            return 'FAILED';
        }
        if ((status.terminating ?? 0) > 0) {
            return 'UNKNOWN';
        }
        if (!!status.completionTime) {
            return 'SUCCEEDED';
        }
        return 'UNKNOWN';
    }
}

const buildService = new BuildService();
export default buildService;

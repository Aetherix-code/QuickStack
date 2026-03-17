import scheduleService from "./schedule.service";
import k3s from "../../adapter/kubernetes-api.adapter";
import dataAccess from "../../adapter/db.client";
import standalonePodService from "./standalone-pod.service";
import clusterService from "../node.service";

const JOB_NAME = 'node-balance-enforcement';
const SKEW_TOLERANCE_PERCENT = 10;

/**
 * This service balances pods across preferred nodes when multiple preferred nodes
 * share the same labels. It prevents situations where all apps end up on a single
 * preferred node after node rotation.
 * Runs every 5 minutes (offset from affinity enforcement by 2 minutes).
 */
class NodeBalanceEnforcementService {

    configureCronJobs() {
        // Run every 5 minutes, offset by 2 minutes from affinity enforcement
        scheduleService.scheduleJob(JOB_NAME, '2-59/10 * * * *', async () => {
            try {
                await this.enforceNodeBalance();
            } catch (error) {
                console.error(`[${NodeBalanceEnforcementService.name}] Error during node balance enforcement:`, error);
            }
        });
    }

    async enforceNodeBalance() {
        console.log(`[${NodeBalanceEnforcementService.name}] Starting node balance enforcement check...`);

        // Get all apps with PREFERRED node affinity
        const allApps = await dataAccess.client.app.findMany({
            where: {
                nodeAffinityType: 'PREFERRED'
            }
        });

        const appsWithPreferredAffinity = allApps.filter(app =>
            app.nodeAffinityLabelSelector && app.nodeAffinityLabelSelector.trim() !== ''
        );

        if (appsWithPreferredAffinity.length === 0) {
            console.log(`[${NodeBalanceEnforcementService.name}] No apps with preferred node affinity found.`);
            return;
        }

        console.log(`[${NodeBalanceEnforcementService.name}] Found ${appsWithPreferredAffinity.length} app(s) with preferred node affinity.`);

        // Get current node information with labels
        const nodes = await clusterService.getNodeInfo();
        const readyNodes = nodes.filter(node => node.schedulable && node.status === 'True');

        if (readyNodes.length === 0) {
            console.log(`[${NodeBalanceEnforcementService.name}] No ready nodes available.`);
            return;
        }

        // Group apps by their normalized label selector
        const groups = this.groupAppsByLabelSelector(appsWithPreferredAffinity);

        let totalPodsRestarted = 0;

        for (const [selectorKey, apps] of groups.entries()) {
            try {
                const labelSelectors: Array<{ key: string; value: string }> = JSON.parse(selectorKey);
                const restarted = await this.balanceGroup(apps, labelSelectors, readyNodes);
                totalPodsRestarted += restarted;
            } catch (error) {
                console.error(`[${NodeBalanceEnforcementService.name}] Error balancing group:`, error);
            }
        }

        if (totalPodsRestarted > 0) {
            console.log(`[${NodeBalanceEnforcementService.name}] Restarted ${totalPodsRestarted} pod(s) for better node balance.`);
        } else {
            console.log(`[${NodeBalanceEnforcementService.name}] All pods are balanced across preferred nodes.`);
        }
    }

    private groupAppsByLabelSelector(
        apps: Array<{ id: string; projectId: string; nodeAffinityLabelSelector: string | null }>
    ): Map<string, Array<{ id: string; projectId: string }>> {
        const groups = new Map<string, Array<{ id: string; projectId: string }>>();

        for (const app of apps) {
            if (!app.nodeAffinityLabelSelector) continue;

            try {
                const selectors = JSON.parse(app.nodeAffinityLabelSelector) as Array<{ key: string; value: string }>;
                const normalized = selectors
                    .map(s => ({ key: s.key, value: s.value }))
                    .sort((a, b) => a.key.localeCompare(b.key) || a.value.localeCompare(b.value));
                const key = JSON.stringify(normalized);

                if (!groups.has(key)) {
                    groups.set(key, []);
                }
                groups.get(key)!.push({ id: app.id, projectId: app.projectId });
            } catch {
                // Skip apps with unparseable selectors
            }
        }

        return groups;
    }

    private async balanceGroup(
        apps: Array<{ id: string; projectId: string }>,
        labelSelectors: Array<{ key: string; value: string }>,
        readyNodes: Array<{ name: string; labels: Record<string, string> }>
    ): Promise<number> {
        const preferredNodes = this.getNodesMatchingPreferences(readyNodes, labelSelectors);

        if (preferredNodes.length < 2) {
            // Need at least 2 preferred nodes to balance
            return 0;
        }

        // Collect all pods across all apps in this group, tracking which preferred node they're on
        const podsByNode = new Map<string, Array<{ podName: string; projectId: string }>>();
        for (const node of preferredNodes) {
            podsByNode.set(node.name, []);
        }

        for (const app of apps) {
            const pods = await standalonePodService.getPodsForApp(app.projectId, app.id);

            for (const pod of pods) {
                try {
                    const podDetails = await k3s.core.readNamespacedPod(pod.podName, app.projectId);
                    const currentNodeName = podDetails.body.spec?.nodeName;

                    if (currentNodeName && podsByNode.has(currentNodeName)) {
                        podsByNode.get(currentNodeName)!.push({
                            podName: pod.podName,
                            projectId: app.projectId
                        });
                    }
                } catch {
                    // Skip pods we can't read
                }
            }
        }

        // Calculate balance
        const nodeCounts = Array.from(podsByNode.entries()).map(([nodeName, pods]) => ({
            nodeName,
            pods,
            count: pods.length
        }));

        const totalPods = nodeCounts.reduce((sum, n) => sum + n.count, 0);
        if (totalPods === 0) {
            return 0;
        }

        const maxCount = Math.max(...nodeCounts.map(n => n.count));
        const minCount = Math.min(...nodeCounts.map(n => n.count));

        // Use a percentage-based tolerance so small absolute skews across many pods are acceptable
        const allowedSkew = Math.max(1, Math.ceil(totalPods * SKEW_TOLERANCE_PERCENT / 100));

        if (maxCount - minCount <= allowedSkew) {
            return 0;
        }

        console.log(`[${NodeBalanceEnforcementService.name}] Imbalance detected (skew ${maxCount - minCount} exceeds allowed ${allowedSkew}): distribution is [${nodeCounts.map(n => `${n.nodeName}=${n.count}`).join(', ')}]`);

        const idealMax = Math.ceil(totalPods / preferredNodes.length);

        // Sort by count descending to process most overloaded first
        nodeCounts.sort((a, b) => b.count - a.count);

        let podsRestarted = 0;

        for (const nodeInfo of nodeCounts) {
            const excess = nodeInfo.count - idealMax;
            if (excess <= 0) continue;

            // Restart excess pods from this overloaded node
            for (let i = 0; i < excess; i++) {
                const pod = nodeInfo.pods[i];
                try {
                    console.log(`[${NodeBalanceEnforcementService.name}] Restarting pod ${pod.podName} from overloaded node ${nodeInfo.nodeName} for balance.`);
                    await k3s.core.deleteNamespacedPod(pod.podName, pod.projectId);
                    podsRestarted++;
                } catch (error) {
                    console.error(`[${NodeBalanceEnforcementService.name}] Error restarting pod ${pod.podName}:`, error);
                }
            }
        }

        return podsRestarted;
    }

    private getNodesMatchingPreferences(
        nodes: Array<{ name: string; labels: Record<string, string> }>,
        labelSelectors: Array<{ key: string; value: string }>
    ): Array<{ name: string; labels: Record<string, string> }> {
        return nodes.filter(node => {
            return labelSelectors.every(selector => {
                const nodeValue = node.labels[selector.key];
                return nodeValue === selector.value;
            });
        });
    }
}

const nodeBalanceEnforcementService = new NodeBalanceEnforcementService();
export default nodeBalanceEnforcementService;

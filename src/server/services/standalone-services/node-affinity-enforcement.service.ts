import scheduleService from "./schedule.service";
import k3s from "../../adapter/kubernetes-api.adapter";
import dataAccess from "../../adapter/db.client";
import standalonePodService from "./standalone-pod.service";
import clusterService from "../node.service";

const JOB_NAME = 'node-affinity-enforcement';

/**
 * This service ensures apps with preferred node affinity are running on their preferred nodes.
 * It runs every 5 minutes to check if any apps are running on non-preferred nodes when
 * preferred nodes are available, and moves them back.
 */
class NodeAffinityEnforcementService {

    configureCronJobs() {
        // Run every 5 minutes
        scheduleService.scheduleJob(JOB_NAME, '*/5 * * * *', async () => {
            try {
                await this.enforceNodeAffinityPreferences();
            } catch (error) {
                console.error(`[${NodeAffinityEnforcementService.name}] Error during node affinity enforcement:`, error);
            }
        });
    }

    async enforceNodeAffinityPreferences() {
        console.log(`[${NodeAffinityEnforcementService.name}] Starting node affinity enforcement check...`);

        // Get all apps with PREFERRED node affinity
        const allApps = await dataAccess.client.app.findMany({
            where: {
                nodeAffinityType: 'PREFERRED'
            }
        });

        // Filter to only apps that have label selectors configured
        const appsWithPreferredAffinity = allApps.filter(app =>
            app.nodeAffinityLabelSelector && app.nodeAffinityLabelSelector.trim() !== ''
        );

        if (appsWithPreferredAffinity.length === 0) {
            console.log(`[${NodeAffinityEnforcementService.name}] No apps with preferred node affinity found.`);
            return;
        }

        console.log(`[${NodeAffinityEnforcementService.name}] Found ${appsWithPreferredAffinity.length} app(s) with preferred node affinity.`);

        // Get current node information with labels
        const nodes = await clusterService.getNodeInfo();
        const readyNodes = nodes.filter(node => node.schedulable && node.status === 'True');

        if (readyNodes.length === 0) {
            console.log(`[${NodeAffinityEnforcementService.name}] No ready nodes available.`);
            return;
        }

        let totalPodsRestarted = 0;

        for (const app of appsWithPreferredAffinity) {
            try {
                const restarted = await this.checkAndRestartAppPodsIfNeeded(app, readyNodes);
                totalPodsRestarted += restarted;
            } catch (error) {
                console.error(`[${NodeAffinityEnforcementService.name}] Error checking app ${app.id}:`, error);
            }
        }

        if (totalPodsRestarted > 0) {
            console.log(`[${NodeAffinityEnforcementService.name}] Restarted ${totalPodsRestarted} pod(s) to move to preferred nodes.`);
        } else {
            console.log(`[${NodeAffinityEnforcementService.name}] All apps are already on their preferred nodes.`);
        }
    }

    private async checkAndRestartAppPodsIfNeeded(
        app: { id: string; projectId: string; nodeAffinityLabelSelector: string | null },
        readyNodes: Array<{ name: string; labels: Record<string, string> }>
    ): Promise<number> {
        // Parse the label selectors
        let labelSelectors: Array<{ key: string; value: string; weight?: number }>;
        try {
            labelSelectors = app.nodeAffinityLabelSelector ? JSON.parse(app.nodeAffinityLabelSelector) : [];
        } catch {
            console.warn(`[${NodeAffinityEnforcementService.name}] Failed to parse nodeAffinityLabelSelector for app ${app.id}`);
            return 0;
        }

        if (labelSelectors.length === 0) {
            return 0;
        }

        // Get pods for this app
        const pods = await standalonePodService.getPodsForApp(app.projectId, app.id);
        if (pods.length === 0) {
            return 0;
        }

        // Find nodes that match the preferred labels
        const preferredNodes = this.getNodesMatchingPreferences(readyNodes, labelSelectors);

        if (preferredNodes.length === 0) {
            // No nodes match the preferred labels, nothing to do
            return 0;
        }

        // Check each pod to see if it's running on a non-preferred node
        let podsRestarted = 0;
        for (const pod of pods) {
            try {
                const podDetails = await k3s.core.readNamespacedPod(pod.podName, app.projectId);
                const currentNodeName = podDetails.body.spec?.nodeName;

                if (!currentNodeName) {
                    // Pod not yet scheduled
                    continue;
                }

                // Check if the current node is in the preferred list
                const isOnPreferredNode = preferredNodes.some(node => node.name === currentNodeName);

                if (!isOnPreferredNode) {
                    console.log(`[${NodeAffinityEnforcementService.name}] App ${app.id} pod ${pod.podName} is on node ${currentNodeName}, which doesn't match preferred labels. Restarting...`);

                    // Delete the pod, it will be recreated by the deployment on a preferred node
                    await k3s.core.deleteNamespacedPod(pod.podName, app.projectId);
                    podsRestarted++;
                }
            } catch (error) {
                console.error(`[${NodeAffinityEnforcementService.name}] Error processing pod ${pod.podName}:`, error);
            }
        }

        if (podsRestarted > 0) {
            console.log(`[${NodeAffinityEnforcementService.name}] Restarted ${podsRestarted} pod(s) for app ${app.id}`);
        }

        return podsRestarted;
    }

    /**
     * Returns nodes that match ALL the label selectors (AND logic).
     * For PREFERRED affinity, we check if nodes satisfy the preferences.
     */
    private getNodesMatchingPreferences(
        nodes: Array<{ name: string; labels: Record<string, string> }>,
        labelSelectors: Array<{ key: string; value: string; weight?: number }>
    ): Array<{ name: string; labels: Record<string, string> }> {
        return nodes.filter(node => {
            // Check if this node matches ALL label selectors
            return labelSelectors.every(selector => {
                const nodeValue = node.labels[selector.key];
                return nodeValue === selector.value;
            });
        });
    }
}

const nodeAffinityEnforcementService = new NodeAffinityEnforcementService();
export default nodeAffinityEnforcementService;

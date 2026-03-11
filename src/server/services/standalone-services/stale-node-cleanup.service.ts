import scheduleService from "./schedule.service";
import k3s from "../../adapter/kubernetes-api.adapter";
import paramService, { ParamService } from "../param.service";
import { revalidateTag } from "next/cache";
import { Tags } from "../../utils/cache-tag-generator.utils";

const JOB_NAME = 'stale-node-cleanup';
const DEFAULT_THRESHOLD_MINUTES = 10;

class StaleNodeCleanupService {

    configureCronJobs() {
        scheduleService.scheduleJob(JOB_NAME, '*/2 * * * *', async () => {
            try {
                await this.cleanupStaleNodes();
            } catch (error) {
                console.error(`[${StaleNodeCleanupService.name}] Error during stale node cleanup:`, error);
            }
        });
    }

    async cleanupStaleNodes() {
        const param = await paramService.getOrUndefinedUncached(ParamService.AUTO_CLEANUP_STALE_NODES);
        if (!param || param.value !== 'true') return;

        const thresholdParam = await paramService.getOrUndefinedUncached(ParamService.STALE_NODE_THRESHOLD_MINUTES);
        const thresholdMinutes = thresholdParam ? Number(thresholdParam.value) : DEFAULT_THRESHOLD_MINUTES;
        const thresholdMs = thresholdMinutes * 60 * 1000;

        const nodeList = await k3s.core.listNode();
        const now = Date.now();
        let removedCount = 0;

        for (const node of nodeList.body.items) {
            const nodeName = node.metadata?.name;
            if (!nodeName) continue;

            // Never delete master/control-plane nodes
            const labels = node.metadata?.labels || {};
            if (labels['node-role.kubernetes.io/master'] === 'true'
                || labels['node-role.kubernetes.io/control-plane'] === 'true') {
                continue;
            }

            const readyCondition = node.status?.conditions?.find(c => c.type === 'Ready');
            if (!readyCondition || readyCondition.status === 'True') continue;

            const lastTransition = readyCondition.lastTransitionTime;
            if (!lastTransition) continue;

            const notReadySince = now - new Date(lastTransition).getTime();
            if (notReadySince > thresholdMs) {
                console.log(`[${StaleNodeCleanupService.name}] Removing stale node "${nodeName}" (NotReady for ${Math.round(notReadySince / 60000)} min)`);
                await k3s.core.deleteNode(nodeName);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            revalidateTag(Tags.nodeInfos());
            console.log(`[${StaleNodeCleanupService.name}] Removed ${removedCount} stale node(s)`);
        }
    }
}

const staleNodeCleanupService = new StaleNodeCleanupService();
export default staleNodeCleanupService;

import k3s from "../adapter/kubernetes-api.adapter";
import * as k8s from '@kubernetes/client-node';
import { NodeInfoModel } from "@/shared/model/node-info.model";
import { NodeResourceModel } from "@/shared/model/node-resource.model";
import { Tags } from "../utils/cache-tag-generator.utils";
import { revalidateTag, unstable_cache } from "next/cache";
import longhornApiAdapter from "../adapter/longhorn-api.adapter";
import { KubeSizeConverter } from "../../shared/utils/kubernetes-size-converter.utils";

const SYSTEM_LABEL_PREFIXES = [
    'kubernetes.io/',
    'k3s.io/',
    'node-role.kubernetes.io/',
    'node.kubernetes.io/',
    'beta.kubernetes.io/',
];

function filterCustomLabels(labels: Record<string, string> | undefined): Record<string, string> {
    if (!labels) return {};
    return Object.fromEntries(
        Object.entries(labels).filter(([key]) =>
            !SYSTEM_LABEL_PREFIXES.some(prefix => key.includes(prefix))
        )
    );
}

class ClusterService {

    async getNodeInfo(): Promise<NodeInfoModel[]> {
        return await unstable_cache(async () => {
            const nodeReturnInfo = await k3s.core.listNode();
            const nodes = nodeReturnInfo.body.items.map((node) => {
                return {
                    name: node.metadata?.name!,
                    status: node.status?.conditions?.filter((condition) => condition.type === 'Ready')[0].status!,
                    os: node.status?.nodeInfo?.osImage!,
                    architecture: node.status?.nodeInfo?.architecture!,
                    cpuCapacity: node.status?.capacity?.cpu!,
                    ramCapacity: node.status?.capacity?.memory!,
                    ip: node.status?.addresses?.filter((address) => address.type === 'InternalIP')[0].address!,
                    kernelVersion: node.status?.nodeInfo?.kernelVersion!,
                    containerRuntimeVersion: node.status?.nodeInfo?.containerRuntimeVersion!,
                    kubeProxyVersion: node.status?.nodeInfo?.kubeProxyVersion!,
                    kubeletVersion: node.status?.nodeInfo?.kubeletVersion!,
                    isMasterNode: node.metadata?.labels?.['node-role.kubernetes.io/master'] === 'true'
                        || node.metadata?.labels?.['node-role.kubernetes.io/control-plane'] === 'true',

                    labels: filterCustomLabels(node.metadata?.labels),

                    memoryOk: node.status?.conditions?.filter((condition) => condition.type === 'MemoryPressure')[0].status === 'False',
                    memoryStatusText: node.status?.conditions?.filter((condition) => condition.type === 'MemoryPressure')[0].message,
                    diskOk: node.status?.conditions?.filter((condition) => condition.type === 'DiskPressure')[0].status === 'False',
                    diskStatusText: node.status?.conditions?.filter((condition) => condition.type === 'DiskPressure')[0].message,
                    pidOk: node.status?.conditions?.filter((condition) => condition.type === 'PIDPressure')[0].status === 'False',
                    pidStatusText: node.status?.conditions?.filter((condition) => condition.type === 'PIDPressure')[0].message,
                    schedulable: !node.spec?.unschedulable
                }
            });
            // Ensure master node is always first
            nodes.sort((a, b) => (a.isMasterNode === b.isMasterNode ? 0 : a.isMasterNode ? -1 : 1));
            return nodes;
        },
            [Tags.nodeInfos()], {
            revalidate: 10,
            tags: [Tags.nodeInfos()]
        })();
    }

    async getMasterNode(): Promise<NodeInfoModel | null> {
        const nodes = await this.getNodeInfo();
        const master = nodes.find(node => node.isMasterNode);
        if (master) return master;
        // Single-node or K3s without role labels: use first Ready node, then any node
        const ready = nodes.find(node => node.status === 'Ready');
        return ready ?? nodes[0] ?? null;
    }

    async setNodeStatus(nodeName: string, schedulable: boolean) {
        try {
            await k3s.core.patchNode(nodeName, { "spec": { "unschedulable": schedulable ? null : true } }, undefined, undefined, undefined, undefined, undefined, {
                headers: { 'Content-Type': 'application/strategic-merge-patch+json' },
            });

            if (!schedulable) {
                // delete all pods on node
                const pods = await k3s.core.listPodForAllNamespaces();
                for (const pod of pods.body.items) {
                    if (pod.spec?.nodeName === nodeName) {
                        await k3s.core.deleteNamespacedPod(pod.metadata?.name!, pod.metadata?.namespace!);
                    }
                }
            }
        } finally {
            revalidateTag(Tags.nodeInfos());
        }
    }

    async addNodeLabel(nodeName: string, key: string, value: string) {
        try {
            await k3s.core.patchNode(
                nodeName,
                { metadata: { labels: { [key]: value } } },
                undefined, undefined, undefined, undefined, undefined,
                { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } }
            );
        } finally {
            revalidateTag(Tags.nodeInfos());
        }
    }

    async removeNodeLabel(nodeName: string, key: string) {
        try {
            await k3s.core.patchNode(
                nodeName,
                [{ op: 'remove', path: `/metadata/labels/${key.replace(/\//g, '~1')}` }],
                undefined, undefined, undefined, undefined, undefined,
                { headers: { 'Content-Type': 'application/json-patch+json' } }
            );
        } finally {
            revalidateTag(Tags.nodeInfos());
        }
    }

    async deleteNode(nodeName: string) {
        try {
            await k3s.core.deleteNode(nodeName);
        } finally {
            revalidateTag(Tags.nodeInfos());
        }
    }

    async getNodeResourceUsage(): Promise<NodeResourceModel[]> {
        const topNodes = await k8s.topNodes(k3s.core);

        // Filter out NotReady nodes — they have no metrics and would cause errors
        const nodeList = await k3s.core.listNode();
        const readyNodeNames = new Set(
            nodeList.body.items
                .filter(node => node.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True')
                .map(node => node.metadata?.name!)
        );
        const readyTopNodes = topNodes.filter(node => readyNodeNames.has(node.Node.metadata?.name!));

        const metricsData: k8s.NodeMetricsList = await k3s.metrics.getNodeMetrics();

        const results = await Promise.all(readyTopNodes.map(async (node) => {
            const nodeMetrics = metricsData.items.filter((metric) => metric.metadata.name === node.Node.metadata?.name)
                .map((metric) => {
                    return {
                        timestamp: new Date(metric.timestamp),
                        cpuUsage: KubeSizeConverter.fromNanoToFullCpu(KubeSizeConverter.fromKubeSizeToNanoCpu(metric.usage.cpu)),
                        ramUsage: KubeSizeConverter.fromKubeSizeToBytes(metric.usage.memory)
                    }
                });

            // sorted by timestamp descending
            nodeMetrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            const latestUsageItem = nodeMetrics[0];

            // Skip nodes without metrics data
            if (!latestUsageItem) {
                console.warn(`No metrics available for node ${node.Node.metadata?.name}, skipping...`);
                return null;
            }

            let diskInfo;
            try {
                diskInfo = await longhornApiAdapter.getNodeStorageInfo(node.Node.metadata?.name!);
            } catch (error) {
                console.warn(`Failed to get storage info for node ${node.Node.metadata?.name}, skipping...`, error);
                return null;
            }

            return {
                name: node.Node.metadata?.name!,
                cpuUsage: latestUsageItem.cpuUsage,
                cpuCapacity: Number(node.CPU?.Capacity!),
                ramUsage: latestUsageItem.ramUsage,
                ramCapacity: Number(node.Memory?.Capacity!),
                diskUsageAbsolut: diskInfo.totalStorageMaximum - diskInfo.totalStorageAvailable,
                diskUsageReserved: diskInfo.totalStorageReserved,
                diskUsageCapacity: diskInfo.totalStorageMaximum,
                diskSpaceSchedulable: diskInfo.totalSchedulableStorage
            }
        }));

        // Filter out null results (nodes without metrics)
        return results.filter((result): result is NodeResourceModel => result !== null);
    }
}

const clusterService = new ClusterService();
export default clusterService;

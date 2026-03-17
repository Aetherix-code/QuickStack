import nodeBalanceEnforcementService from '@/server/services/standalone-services/node-balance-enforcement.service';
import dataAccess from '@/server/adapter/db.client';
import k3s from '@/server/adapter/kubernetes-api.adapter';
import standalonePodService from '@/server/services/standalone-services/standalone-pod.service';
import clusterService from '@/server/services/node.service';

// Mock dependencies
jest.mock('@/server/adapter/db.client', () => ({
    client: {
        app: {
            findMany: jest.fn(),
        }
    }
}));

jest.mock('@/server/adapter/kubernetes-api.adapter', () => ({
    core: {
        readNamespacedPod: jest.fn(),
        deleteNamespacedPod: jest.fn(),
    }
}));

jest.mock('@/server/services/standalone-services/standalone-pod.service', () => ({
    getPodsForApp: jest.fn(),
}));

jest.mock('@/server/services/node.service', () => ({
    getNodeInfo: jest.fn(),
}));

jest.mock('@/server/services/standalone-services/schedule.service', () => ({
    scheduleJob: jest.fn(),
}));

describe('NodeBalanceEnforcementService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('enforceNodeBalance', () => {
        it('should do nothing when no apps have preferred affinity', async () => {
            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue([]);

            await nodeBalanceEnforcementService.enforceNodeBalance();

            expect(standalonePodService.getPodsForApp).not.toHaveBeenCalled();
        });

        it('should do nothing when only one preferred node exists', async () => {
            const mockApp = {
                id: 'app-1',
                projectId: 'proj-1',
                nodeAffinityLabelSelector: JSON.stringify([
                    { key: 'nodetype', value: 'small', weight: 100 }
                ])
            };

            const mockNodes = [
                { name: 'node-small-1', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-big-1', status: 'True', schedulable: true, labels: { nodetype: 'big' } },
            ];

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue([mockApp]);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);

            await nodeBalanceEnforcementService.enforceNodeBalance();

            // Only 1 preferred node (node-small-1), can't balance
            expect(standalonePodService.getPodsForApp).not.toHaveBeenCalled();
        });

        it('should restart pods when imbalanced across preferred nodes', async () => {
            const mockApps = [
                { id: 'app-1', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
                { id: 'app-2', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
                { id: 'app-3', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
            ];

            const mockNodes = [
                { name: 'node-small-1', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-small-2', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
            ];

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue(mockApps);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);

            // All 3 apps have pods on node-small-1
            (standalonePodService.getPodsForApp as jest.Mock)
                .mockResolvedValueOnce([{ podName: 'pod-1', containerName: 'c1' }])
                .mockResolvedValueOnce([{ podName: 'pod-2', containerName: 'c2' }])
                .mockResolvedValueOnce([{ podName: 'pod-3', containerName: 'c3' }]);

            (k3s.core.readNamespacedPod as jest.Mock)
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-small-1' } } })
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-small-1' } } })
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-small-1' } } });

            await nodeBalanceEnforcementService.enforceNodeBalance();

            // 3 pods on node-small-1, 0 on node-small-2 → idealMax = ceil(3/2) = 2
            // excess on node-small-1 = 3 - 2 = 1 pod to restart
            expect(k3s.core.deleteNamespacedPod).toHaveBeenCalledTimes(1);
        });

        it('should not restart pods when already balanced', async () => {
            const mockApps = [
                { id: 'app-1', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
                { id: 'app-2', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
            ];

            const mockNodes = [
                { name: 'node-small-1', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-small-2', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
            ];

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue(mockApps);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);

            (standalonePodService.getPodsForApp as jest.Mock)
                .mockResolvedValueOnce([{ podName: 'pod-1', containerName: 'c1' }])
                .mockResolvedValueOnce([{ podName: 'pod-2', containerName: 'c2' }]);

            // One pod on each node
            (k3s.core.readNamespacedPod as jest.Mock)
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-small-1' } } })
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-small-2' } } });

            await nodeBalanceEnforcementService.enforceNodeBalance();

            expect(k3s.core.deleteNamespacedPod).not.toHaveBeenCalled();
        });

        it('should not restart pods when skew is only 1', async () => {
            const mockApps = [
                { id: 'app-1', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
                { id: 'app-2', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
                { id: 'app-3', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
            ];

            const mockNodes = [
                { name: 'node-small-1', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-small-2', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
            ];

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue(mockApps);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);

            (standalonePodService.getPodsForApp as jest.Mock)
                .mockResolvedValueOnce([{ podName: 'pod-1', containerName: 'c1' }])
                .mockResolvedValueOnce([{ podName: 'pod-2', containerName: 'c2' }])
                .mockResolvedValueOnce([{ podName: 'pod-3', containerName: 'c3' }]);

            // 2 pods on node-small-1, 1 on node-small-2 → skew is 1, acceptable
            (k3s.core.readNamespacedPod as jest.Mock)
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-small-1' } } })
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-small-1' } } })
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-small-2' } } });

            await nodeBalanceEnforcementService.enforceNodeBalance();

            expect(k3s.core.deleteNamespacedPod).not.toHaveBeenCalled();
        });

        it('should only count pods on preferred nodes for balance calculation', async () => {
            const mockApps = [
                { id: 'app-1', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
                { id: 'app-2', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
            ];

            const mockNodes = [
                { name: 'node-small-1', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-small-2', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-big-1', status: 'True', schedulable: true, labels: { nodetype: 'big' } },
            ];

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue(mockApps);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);

            (standalonePodService.getPodsForApp as jest.Mock)
                .mockResolvedValueOnce([{ podName: 'pod-1', containerName: 'c1' }])
                .mockResolvedValueOnce([{ podName: 'pod-2', containerName: 'c2' }]);

            // pod-1 on preferred node, pod-2 on non-preferred node (ignored for balance)
            (k3s.core.readNamespacedPod as jest.Mock)
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-small-1' } } })
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-big-1' } } });

            await nodeBalanceEnforcementService.enforceNodeBalance();

            // Only 1 pod on preferred nodes total, can't be imbalanced
            expect(k3s.core.deleteNamespacedPod).not.toHaveBeenCalled();
        });

        it('should handle different label selector groups independently', async () => {
            const mockApps = [
                { id: 'app-1', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
                { id: 'app-2', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'small' }]) },
                { id: 'app-3', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([{ key: 'nodetype', value: 'big' }]) },
            ];

            const mockNodes = [
                { name: 'node-small-1', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-small-2', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-big-1', status: 'True', schedulable: true, labels: { nodetype: 'big' } },
            ];

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue(mockApps);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);

            // "small" group: both pods on node-small-1
            (standalonePodService.getPodsForApp as jest.Mock)
                .mockResolvedValueOnce([{ podName: 'pod-1', containerName: 'c1' }])
                .mockResolvedValueOnce([{ podName: 'pod-2', containerName: 'c2' }])
                // "big" group: only 1 preferred node, skipped
                .mockResolvedValueOnce([{ podName: 'pod-3', containerName: 'c3' }]);

            (k3s.core.readNamespacedPod as jest.Mock)
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-small-1' } } })
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-small-1' } } });

            await nodeBalanceEnforcementService.enforceNodeBalance();

            // "small" group: 2 on node-small-1, 0 on node-small-2 → skew 2, restart 1
            // "big" group: only 1 preferred node, can't balance → no action
            expect(k3s.core.deleteNamespacedPod).toHaveBeenCalledTimes(1);
        });

        it('should handle severe imbalance across three nodes', async () => {
            const selector = JSON.stringify([{ key: 'nodetype', value: 'small' }]);
            const mockApps = [
                { id: 'app-1', projectId: 'proj-1', nodeAffinityLabelSelector: selector },
                { id: 'app-2', projectId: 'proj-1', nodeAffinityLabelSelector: selector },
                { id: 'app-3', projectId: 'proj-1', nodeAffinityLabelSelector: selector },
                { id: 'app-4', projectId: 'proj-1', nodeAffinityLabelSelector: selector },
                { id: 'app-5', projectId: 'proj-1', nodeAffinityLabelSelector: selector },
                { id: 'app-6', projectId: 'proj-1', nodeAffinityLabelSelector: selector },
            ];

            const mockNodes = [
                { name: 'node-1', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-2', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-3', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
            ];

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue(mockApps);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);

            // All 6 pods on node-1
            const pods = Array.from({ length: 6 }, (_, i) => [{ podName: `pod-${i + 1}`, containerName: `c${i + 1}` }]);
            for (const pod of pods) {
                (standalonePodService.getPodsForApp as jest.Mock).mockResolvedValueOnce(pod);
            }

            for (let i = 0; i < 6; i++) {
                (k3s.core.readNamespacedPod as jest.Mock).mockResolvedValueOnce({
                    body: { spec: { nodeName: 'node-1' } }
                });
            }

            await nodeBalanceEnforcementService.enforceNodeBalance();

            // 6 pods, 3 nodes → idealMax = 2, excess on node-1 = 6-2 = 4 pods to restart
            expect(k3s.core.deleteNamespacedPod).toHaveBeenCalledTimes(4);
        });

        it('should handle apps with multiple label selectors grouped correctly', async () => {
            // Two apps with same multi-label selector but in different order
            const mockApps = [
                { id: 'app-1', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([
                    { key: 'region', value: 'us-east', weight: 50 },
                    { key: 'nodetype', value: 'small', weight: 100 }
                ]) },
                { id: 'app-2', projectId: 'proj-1', nodeAffinityLabelSelector: JSON.stringify([
                    { key: 'nodetype', value: 'small', weight: 100 },
                    { key: 'region', value: 'us-east', weight: 50 }
                ]) },
            ];

            const mockNodes = [
                { name: 'node-1', status: 'True', schedulable: true, labels: { nodetype: 'small', region: 'us-east' } },
                { name: 'node-2', status: 'True', schedulable: true, labels: { nodetype: 'small', region: 'us-east' } },
            ];

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue(mockApps);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);

            // Both pods on same node
            (standalonePodService.getPodsForApp as jest.Mock)
                .mockResolvedValueOnce([{ podName: 'pod-1', containerName: 'c1' }])
                .mockResolvedValueOnce([{ podName: 'pod-2', containerName: 'c2' }]);

            (k3s.core.readNamespacedPod as jest.Mock)
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-1' } } })
                .mockResolvedValueOnce({ body: { spec: { nodeName: 'node-1' } } });

            await nodeBalanceEnforcementService.enforceNodeBalance();

            // Both apps should be in the same group (normalized label selectors)
            // 2 pods on node-1, 0 on node-2 → skew 2, restart 1
            expect(k3s.core.deleteNamespacedPod).toHaveBeenCalledTimes(1);
        });

        it('should tolerate small skew when pod count is large (percentage-based threshold)', async () => {
            const selector = JSON.stringify([{ key: 'nodetype', value: 'small' }]);
            // 20 apps → 10% tolerance = allowed skew of 2
            const mockApps = Array.from({ length: 20 }, (_, i) => ({
                id: `app-${i + 1}`,
                projectId: 'proj-1',
                nodeAffinityLabelSelector: selector
            }));

            const mockNodes = [
                { name: 'node-1', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-2', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
            ];

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue(mockApps);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);

            // Each app has 1 pod
            for (let i = 0; i < 20; i++) {
                (standalonePodService.getPodsForApp as jest.Mock).mockResolvedValueOnce([{ podName: `pod-${i + 1}`, containerName: `c${i + 1}` }]);
            }

            // 12 pods on node-1, 8 on node-2 → skew of 4, but allowed skew = ceil(20*0.10) = 2
            // This exceeds the tolerance, so we should still restart
            for (let i = 0; i < 12; i++) {
                (k3s.core.readNamespacedPod as jest.Mock).mockResolvedValueOnce({ body: { spec: { nodeName: 'node-1' } } });
            }
            for (let i = 0; i < 8; i++) {
                (k3s.core.readNamespacedPod as jest.Mock).mockResolvedValueOnce({ body: { spec: { nodeName: 'node-2' } } });
            }

            await nodeBalanceEnforcementService.enforceNodeBalance();

            // idealMax = ceil(20/2) = 10, excess on node-1 = 12 - 10 = 2
            expect(k3s.core.deleteNamespacedPod).toHaveBeenCalledTimes(2);
        });

        it('should not restart pods when skew is within percentage-based tolerance', async () => {
            const selector = JSON.stringify([{ key: 'nodetype', value: 'small' }]);
            // 20 apps → 10% tolerance = allowed skew of 2
            const mockApps = Array.from({ length: 20 }, (_, i) => ({
                id: `app-${i + 1}`,
                projectId: 'proj-1',
                nodeAffinityLabelSelector: selector
            }));

            const mockNodes = [
                { name: 'node-1', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
                { name: 'node-2', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
            ];

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue(mockApps);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);

            for (let i = 0; i < 20; i++) {
                (standalonePodService.getPodsForApp as jest.Mock).mockResolvedValueOnce([{ podName: `pod-${i + 1}`, containerName: `c${i + 1}` }]);
            }

            // 11 pods on node-1, 9 on node-2 → skew of 2, allowed skew = ceil(20*0.10) = 2
            for (let i = 0; i < 11; i++) {
                (k3s.core.readNamespacedPod as jest.Mock).mockResolvedValueOnce({ body: { spec: { nodeName: 'node-1' } } });
            }
            for (let i = 0; i < 9; i++) {
                (k3s.core.readNamespacedPod as jest.Mock).mockResolvedValueOnce({ body: { spec: { nodeName: 'node-2' } } });
            }

            await nodeBalanceEnforcementService.enforceNodeBalance();

            // Skew of 2 is within the allowed tolerance of 2 → no restarts
            expect(k3s.core.deleteNamespacedPod).not.toHaveBeenCalled();
        });
    });
});

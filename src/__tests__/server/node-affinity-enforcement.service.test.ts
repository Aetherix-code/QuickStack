import nodeAffinityEnforcementService from '@/server/services/standalone-services/node-affinity-enforcement.service';
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

describe('NodeAffinityEnforcementService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('enforceNodeAffinityPreferences', () => {
        it('should do nothing when no apps have preferred affinity', async () => {
            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue([]);

            await nodeAffinityEnforcementService.enforceNodeAffinityPreferences();

            expect(standalonePodService.getPodsForApp).not.toHaveBeenCalled();
        });

        it('should restart pod when running on non-preferred node and preferred node is available', async () => {
            const mockApp = {
                id: 'test-app',
                projectId: 'test-project',
                nodeAffinityLabelSelector: JSON.stringify([
                    { key: 'nodetype', value: 'small', weight: 100 }
                ])
            };

            const mockNodes = [
                { name: 'node-big', status: 'True', schedulable: true, labels: { nodetype: 'big' } },
                { name: 'node-small', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
            ];

            const mockPods = [
                { podName: 'test-pod-1', containerName: 'container-1' }
            ];

            const mockPodDetails = {
                body: {
                    spec: {
                        nodeName: 'node-big' // Pod is on non-preferred node
                    }
                }
            };

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue([mockApp]);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);
            (standalonePodService.getPodsForApp as jest.Mock).mockResolvedValue(mockPods);
            (k3s.core.readNamespacedPod as jest.Mock).mockResolvedValue(mockPodDetails);

            await nodeAffinityEnforcementService.enforceNodeAffinityPreferences();

            expect(k3s.core.deleteNamespacedPod).toHaveBeenCalledWith('test-pod-1', 'test-project');
        });

        it('should not restart pod when already on preferred node', async () => {
            const mockApp = {
                id: 'test-app',
                projectId: 'test-project',
                nodeAffinityLabelSelector: JSON.stringify([
                    { key: 'nodetype', value: 'small', weight: 100 }
                ])
            };

            const mockNodes = [
                { name: 'node-small', status: 'True', schedulable: true, labels: { nodetype: 'small' } },
            ];

            const mockPods = [
                { podName: 'test-pod-1', containerName: 'container-1' }
            ];

            const mockPodDetails = {
                body: {
                    spec: {
                        nodeName: 'node-small' // Pod is already on preferred node
                    }
                }
            };

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue([mockApp]);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);
            (standalonePodService.getPodsForApp as jest.Mock).mockResolvedValue(mockPods);
            (k3s.core.readNamespacedPod as jest.Mock).mockResolvedValue(mockPodDetails);

            await nodeAffinityEnforcementService.enforceNodeAffinityPreferences();

            expect(k3s.core.deleteNamespacedPod).not.toHaveBeenCalled();
        });

        it('should not restart pod when no preferred nodes are available', async () => {
            const mockApp = {
                id: 'test-app',
                projectId: 'test-project',
                nodeAffinityLabelSelector: JSON.stringify([
                    { key: 'nodetype', value: 'small', weight: 100 }
                ])
            };

            const mockNodes = [
                { name: 'node-big', status: 'True', schedulable: true, labels: { nodetype: 'big' } },
            ];

            const mockPods = [
                { podName: 'test-pod-1', containerName: 'container-1' }
            ];

            const mockPodDetails = {
                body: {
                    spec: {
                        nodeName: 'node-big'
                    }
                }
            };

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue([mockApp]);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);
            (standalonePodService.getPodsForApp as jest.Mock).mockResolvedValue(mockPods);
            (k3s.core.readNamespacedPod as jest.Mock).mockResolvedValue(mockPodDetails);

            await nodeAffinityEnforcementService.enforceNodeAffinityPreferences();

            expect(k3s.core.deleteNamespacedPod).not.toHaveBeenCalled();
        });

        it('should handle multiple label selectors with AND logic', async () => {
            const mockApp = {
                id: 'test-app',
                projectId: 'test-project',
                nodeAffinityLabelSelector: JSON.stringify([
                    { key: 'nodetype', value: 'small', weight: 100 },
                    { key: 'region', value: 'us-east', weight: 50 }
                ])
            };

            const mockNodes = [
                { name: 'node-1', status: 'True', schedulable: true, labels: { nodetype: 'small', region: 'us-west' } },
                { name: 'node-2', status: 'True', schedulable: true, labels: { nodetype: 'small', region: 'us-east' } },
                { name: 'node-3', status: 'True', schedulable: true, labels: { nodetype: 'big', region: 'us-east' } },
            ];

            const mockPods = [
                { podName: 'test-pod-1', containerName: 'container-1' }
            ];

            const mockPodDetails = {
                body: {
                    spec: {
                        nodeName: 'node-1' // Has nodetype=small but wrong region
                    }
                }
            };

            (dataAccess.client.app.findMany as jest.Mock).mockResolvedValue([mockApp]);
            (clusterService.getNodeInfo as jest.Mock).mockResolvedValue(mockNodes);
            (standalonePodService.getPodsForApp as jest.Mock).mockResolvedValue(mockPods);
            (k3s.core.readNamespacedPod as jest.Mock).mockResolvedValue(mockPodDetails);

            await nodeAffinityEnforcementService.enforceNodeAffinityPreferences();

            // Should restart because node-2 matches ALL requirements
            expect(k3s.core.deleteNamespacedPod).toHaveBeenCalledWith('test-pod-1', 'test-project');
        });
    });
});

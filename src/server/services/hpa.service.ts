import { AppExtendedModel } from "@/shared/model/app-extended.model";
import k3s from "../adapter/kubernetes-api.adapter";
import { V2HorizontalPodAutoscaler } from "@kubernetes/client-node";
import { KubeObjectNameUtils } from "../utils/kube-object-name.utils";
import { Constants } from "../../shared/utils/constants";
import { dlog } from "./deployment-logs.service";
import appService from "./app.service";

class HpaService {

    async deleteHpa(projectId: string, appId: string) {
        const existingHpa = await this.getHpa(projectId, appId);
        if (!existingHpa) {
            return;
        }
        const hpaName = KubeObjectNameUtils.toHpaName(appId);
        await k3s.autoscaling.deleteNamespacedHorizontalPodAutoscaler(hpaName, projectId);
        console.log(`Deleted HPA ${hpaName} in namespace ${projectId}`);
    }

    async getHpa(projectId: string, appId: string) {
        try {
            const hpaName = KubeObjectNameUtils.toHpaName(appId);
            const res = await k3s.autoscaling.readNamespacedHorizontalPodAutoscaler(hpaName, projectId);
            return res.body;
        } catch (error: any) {
            if (error?.response?.statusCode === 404) {
                return undefined;
            }
            throw error;
        }
    }

    async createOrUpdateHpaForApp(deploymentId: string, app: AppExtendedModel) {
        if (!app.autoScalingEnabled) {
            // Delete HPA if auto-scaling is disabled
            const existingHpa = await this.getHpa(app.projectId, app.id);
            if (existingHpa) {
                await this.deleteHpa(app.projectId, app.id);
                dlog(deploymentId, `Auto-scaling disabled. Deleted HPA for app ${app.name}`);
            }
            return;
        }

        // Validate that resource requests are set (required for HPA)
        if (!app.cpuReservation && !app.memoryReservation) {
            dlog(deploymentId, `Warning: HPA requires CPU or memory resource requests to be set. Auto-scaling may not work properly.`);
        }

        await this.createOrUpdateHpa(app.projectId, app.id, app.minReplicas, app.maxReplicas, app.cpuThreshold, app.memoryThreshold);

        // Build log message based on which metrics are active
        const metrics: string[] = [];
        if (app.cpuReservation) metrics.push(`CPU=${app.cpuThreshold}%`);
        if (app.memoryReservation) metrics.push(`Memory=${app.memoryThreshold}%`);
        dlog(deploymentId, `Created/Updated HPA for app ${app.name} with min=${app.minReplicas}, max=${app.maxReplicas}, metrics: ${metrics.join(', ')}`);
    }

    async createOrUpdateHpa(namespace: string, kubeAppName: string, minReplicas: number, maxReplicas: number, cpuThreshold: number, memoryThreshold: number) {
        const existingHpa = await this.getHpa(namespace, kubeAppName);
        const hpaName = KubeObjectNameUtils.toHpaName(kubeAppName);

        // Get the app to check which resource requests are set
        const app = await appService.getExtendedById(kubeAppName);

        // Build metrics array - only include metrics for which resource requests are set
        const metrics: any[] = [];

        if (app.cpuReservation) {
            metrics.push({
                type: 'Resource',
                resource: {
                    name: 'cpu',
                    target: {
                        type: 'Utilization',
                        averageUtilization: cpuThreshold,
                    },
                },
            });
        }

        if (app.memoryReservation) {
            metrics.push({
                type: 'Resource',
                resource: {
                    name: 'memory',
                    target: {
                        type: 'Utilization',
                        averageUtilization: memoryThreshold,
                    },
                },
            });
        }

        const body: V2HorizontalPodAutoscaler = {
            apiVersion: 'autoscaling/v2',
            kind: 'HorizontalPodAutoscaler',
            metadata: {
                name: hpaName,
                namespace: namespace,
                annotations: {
                    [Constants.QS_ANNOTATION_APP_ID]: kubeAppName,
                    [Constants.QS_ANNOTATION_PROJECT_ID]: namespace,
                },
            },
            spec: {
                scaleTargetRef: {
                    apiVersion: 'apps/v1',
                    kind: 'Deployment',
                    name: kubeAppName,
                },
                minReplicas: minReplicas,
                maxReplicas: maxReplicas,
                metrics: metrics,
            },
        };

        if (existingHpa) {
            await k3s.autoscaling.replaceNamespacedHorizontalPodAutoscaler(hpaName, namespace, body);
        } else {
            await k3s.autoscaling.createNamespacedHorizontalPodAutoscaler(namespace, body);
        }
    }
}

const hpaService = new HpaService();
export default hpaService;

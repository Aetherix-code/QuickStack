'use server'

import monitoringService from "@/server/services/monitoring.service";
import clusterService from "@/server/services/node.service";
import { getAuthUserSession, simpleAction } from "@/server/utils/action-wrapper.utils";
import { UserGroupUtils } from "@/shared/utils/role.utils";
import { AppMonitoringUsageModel } from "@/shared/model/app-monitoring-usage.model";
import { AppVolumeMonitoringUsageModel } from "@/shared/model/app-volume-monitoring-usage.model";
import { NodeResourceModel } from "@/shared/model/node-resource.model";
import { ServerActionResult } from "@/shared/model/server-action-error-return.model";
import projectService from "@/server/services/project.service";
import podService from "@/server/services/pod.service";

export const getNodeResourceUsage = async () =>
    simpleAction(async () => {
        await getAuthUserSession();
        return await clusterService.getNodeResourceUsage();
    }) as Promise<ServerActionResult<unknown, NodeResourceModel[]>>;

export const getVolumeMonitoringUsage = async () =>
    simpleAction(async () => {
        const session = await getAuthUserSession();
        let volumesUsage = await monitoringService.getAllAppVolumesUsage();
        volumesUsage = volumesUsage?.filter((volume) => UserGroupUtils.sessionHasReadAccessForApp(session, volume.appId));
        return volumesUsage;
    }) as Promise<ServerActionResult<unknown, AppVolumeMonitoringUsageModel[]>>;

export const getMonitoringForAllApps = async () =>
    simpleAction(async () => {
        const session = await getAuthUserSession();
        let updatedNodeRessources = await monitoringService.getMonitoringForAllApps();
        updatedNodeRessources = updatedNodeRessources?.filter((app) => UserGroupUtils.sessionHasReadAccessForApp(session, app.appId));
        return updatedNodeRessources;
    }) as Promise<ServerActionResult<unknown, AppMonitoringUsageModel[]>>;

export const getAllProjectsWithAppsAndPods = async () =>
    simpleAction(async () => {
        const session = await getAuthUserSession();
        const projects = await projectService.getAllProjects();

        const projectsWithPods = await Promise.all(
            projects.map(async (project) => {
                const appsWithPods = await Promise.all(
                    project.apps
                        .filter((app) => UserGroupUtils.sessionHasReadAccessForApp(session, app.id))
                        .map(async (app) => {
                            const pods = await podService.getPodsForApp(project.id, app.id);
                            return {
                                id: app.id,
                                name: app.name,
                                pods: pods
                            };
                        })
                );
                return {
                    id: project.id,
                    name: project.name,
                    apps: appsWithPods
                };
            })
        );

        return projectsWithPods;
    });
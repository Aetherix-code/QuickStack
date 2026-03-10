'use server'

import { AppRateLimitsModel, appRateLimitsZodModel } from "@/shared/model/app-rate-limits.model";
import { appSourceInfoContainerZodModel, appSourceInfoGitZodModel, AppSourceInfoInputModel, appSourceInfoInputZodModel } from "@/shared/model/app-source-info.model";
import { AuthFormInputSchema, authFormInputSchemaZod } from "@/shared/model/auth-form";
import { ErrorActionResult, ServerActionResult, SuccessActionResult } from "@/shared/model/server-action-error-return.model";
import { ServiceException } from "@/shared/model/service.exception.model";
import appService from "@/server/services/app.service";
import userService from "@/server/services/user.service";
import { getAuthUserSession, isAuthorizedWriteForApp, saveFormAction, simpleAction } from "@/server/utils/action-wrapper.utils";
import { AppNodeAffinityModel, appNodeAffinityZodModel } from "@/shared/model/app-node-affinity.model";


export const saveGeneralAppSourceInfo = async (prevState: any, inputData: AppSourceInfoInputModel, appId: string) => {
    if (inputData.sourceType === 'GIT') {
        return saveFormAction(inputData, appSourceInfoGitZodModel, async (validatedData) => {
            await isAuthorizedWriteForApp(appId);
            const session = await getAuthUserSession();
            const existingApp = await appService.getById(appId);

            // If switching from CONTAINER to GIT or changing repo, cleanup old webhook
            if (existingApp.sourceType === 'CONTAINER' || existingApp.gitUrl !== validatedData.gitUrl) {
                await appService.cleanupGitHubWebhook(appId, session.email);
            }

            await appService.save({
                ...existingApp,
                ...validatedData,
                sourceType: 'GIT',
                id: appId,
            });

            // Setup GitHub webhook for auto-deploy on push
            try {
                await appService.setupGitHubWebhook(appId, session.email);
            } catch (e: any) {
                // Don't fail the save if webhook setup fails — inform the user
                return new SuccessActionResult(undefined, `Source saved, but webhook setup failed: ${e.message}`);
            }
        });
    } else if (inputData.sourceType === 'CONTAINER') {
        return saveFormAction(inputData, appSourceInfoContainerZodModel, async (validatedData) => {
            await isAuthorizedWriteForApp(appId);
            const session = await getAuthUserSession();
            const existingApp = await appService.getById(appId);

            // Cleanup GitHub webhook when switching away from GIT
            if (existingApp.sourceType === 'GIT') {
                await appService.cleanupGitHubWebhook(appId, session.email);
            }

            await appService.save({
                ...existingApp,
                ...validatedData,
                sourceType: 'CONTAINER',
                id: appId,
            });
        });
    } else {
        return simpleAction(async () => new ServerActionResult('error', undefined, 'Invalid Source Type', undefined));
    }
};

export const saveGeneralAppRateLimits = async (prevState: any, inputData: AppRateLimitsModel, appId: string) =>
    saveFormAction(inputData, appRateLimitsZodModel, async (validatedData) => {
        // Validate min/max replica constraints
        if (validatedData.minReplicas < 1) {
            throw new ServiceException('Minimum Replica Count must be at least 1');
        }
        if (validatedData.maxReplicas < validatedData.minReplicas) {
            throw new ServiceException('Maximum Replica Count must be greater than or equal to Minimum Replica Count');
        }
        if (validatedData.currentReplicas < validatedData.minReplicas || validatedData.currentReplicas > validatedData.maxReplicas) {
            throw new ServiceException(`Current Replica Count must be between ${validatedData.minReplicas} and ${validatedData.maxReplicas}`);
        }

        // Validate threshold values
        if (validatedData.cpuThreshold < 1 || validatedData.cpuThreshold > 100) {
            throw new ServiceException('CPU Threshold must be between 1 and 100');
        }
        if (validatedData.memoryThreshold < 1 || validatedData.memoryThreshold > 100) {
            throw new ServiceException('Memory Threshold must be between 1 and 100');
        }

        await isAuthorizedWriteForApp(appId);

        const extendedApp = await appService.getExtendedById(appId);
        // Validate ReadWriteOnce volume constraints
        if (extendedApp.appVolumes.some(v => v.accessMode === 'ReadWriteOnce') && validatedData.maxReplicas > 1) {
            throw new ServiceException('Maximum Replica Count must be 1 because you have at least one volume with access mode ReadWriteOnce.');
        }

        // Validate HPA requirements
        if (validatedData.autoScalingEnabled && !extendedApp.cpuReservation && !extendedApp.memoryReservation) {
            throw new ServiceException('Auto-scaling requires CPU or memory resource requests to be set.');
        }

        const existingApp = await appService.getById(appId);
        await appService.save({
            ...existingApp,
            ...validatedData,
            id: appId,
        });
    });

export const saveGeneralAppNodeAffinity = async (prevState: any, inputData: AppNodeAffinityModel, appId: string) =>
    saveFormAction(inputData, appNodeAffinityZodModel, async (validatedData) => {
        await isAuthorizedWriteForApp(appId);

        if ((validatedData.nodeAffinityType === 'REQUIRED' || validatedData.nodeAffinityType === 'PREFERRED')
            && validatedData.nodeAffinityLabelSelector.length === 0) {
            throw new ServiceException('At least one node label selector must be added when using Required or Preferred affinity type');
        }

        const existingApp = await appService.getById(appId);
        await appService.save({
            ...existingApp,
            nodeAffinityType: validatedData.nodeAffinityType,
            nodeAffinityLabelSelector: JSON.stringify(validatedData.nodeAffinityLabelSelector),
            id: appId,
        });
    });

export const getCurrentUserGitHubConnection = async () =>
    simpleAction(async () => {
        const session = await getAuthUserSession();
        const user = await userService.getUserByEmail(session.email);
        return new SuccessActionResult({
            hasGitHub: !!user.githubAccessToken,
            githubUsername: user.githubUsername
        }, undefined);
    });

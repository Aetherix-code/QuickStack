/*
  Warnings:

  - You are about to drop the column `replicas` on the `App` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_App" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "appType" TEXT NOT NULL DEFAULT 'APP',
    "projectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'GIT',
    "containerImageSource" TEXT,
    "containerRegistryUsername" TEXT,
    "containerRegistryPassword" TEXT,
    "gitUrl" TEXT,
    "gitBranch" TEXT,
    "gitUsername" TEXT,
    "gitToken" TEXT,
    "dockerfilePath" TEXT NOT NULL DEFAULT './Dockerfile',
    "buildMethod" TEXT NOT NULL DEFAULT 'DOCKERFILE',
    "minReplicas" INTEGER NOT NULL DEFAULT 1,
    "maxReplicas" INTEGER NOT NULL DEFAULT 1,
    "currentReplicas" INTEGER NOT NULL DEFAULT 1,
    "autoScalingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "envVars" TEXT NOT NULL DEFAULT '',
    "memoryReservation" INTEGER,
    "memoryLimit" INTEGER,
    "cpuReservation" INTEGER,
    "cpuLimit" INTEGER,
    "webhookId" TEXT,
    "ingressNetworkPolicy" TEXT NOT NULL DEFAULT 'ALLOW_ALL',
    "egressNetworkPolicy" TEXT NOT NULL DEFAULT 'ALLOW_ALL',
    "useNetworkPolicy" BOOLEAN NOT NULL DEFAULT true,
    "nodeAffinityType" TEXT NOT NULL DEFAULT 'NONE',
    "nodeAffinityLabelSelector" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "App_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_App" ("appType", "buildMethod", "containerImageSource", "containerRegistryPassword", "containerRegistryUsername", "cpuLimit", "cpuReservation", "createdAt", "dockerfilePath", "egressNetworkPolicy", "envVars", "gitBranch", "gitToken", "gitUrl", "gitUsername", "id", "ingressNetworkPolicy", "memoryLimit", "memoryReservation", "name", "nodeAffinityLabelSelector", "nodeAffinityType", "projectId", "sourceType", "updatedAt", "useNetworkPolicy", "webhookId", "minReplicas", "maxReplicas", "currentReplicas", "autoScalingEnabled") SELECT "appType", "buildMethod", "containerImageSource", "containerRegistryPassword", "containerRegistryUsername", "cpuLimit", "cpuReservation", "createdAt", "dockerfilePath", "egressNetworkPolicy", "envVars", "gitBranch", "gitToken", "gitUrl", "gitUsername", "id", "ingressNetworkPolicy", "memoryLimit", "memoryReservation", "name", "nodeAffinityLabelSelector", "nodeAffinityType", "projectId", "sourceType", "updatedAt", "useNetworkPolicy", "webhookId", "replicas", "replicas", "replicas", false FROM "App";
DROP TABLE "App";
ALTER TABLE "new_App" RENAME TO "App";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

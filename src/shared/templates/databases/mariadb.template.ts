import { Constants } from "@/shared/utils/constants";
import { AppTemplateModel } from "../../model/app-template.model";

export const mariadbAppTemplate: AppTemplateModel = {
    name: "MariaDB",
    iconName: 'mariadb.svg',
    templates: [{
        inputSettings: [
            {
                key: "containerImageSource",
                label: "Container Image",
                value: "mariadb:11",
                isEnvVar: false,
                randomGeneratedIfEmpty: false,
            },
            {
                key: "MYSQL_DATABASE",
                label: "Database Name",
                value: "mariadb",
                isEnvVar: true,
                randomGeneratedIfEmpty: false,
            },
            {
                key: "MYSQL_USER",
                label: "Database User",
                value: "mariadbuser",
                isEnvVar: true,
                randomGeneratedIfEmpty: false,
            },
            {
                key: "MYSQL_PASSWORD",
                label: "Database Passwort",
                value: "",
                isEnvVar: true,
                randomGeneratedIfEmpty: true,
            },
            {
                key: "MYSQL_ROOT_PASSWORD",
                label: "Root Password",
                value: "",
                isEnvVar: true,
                randomGeneratedIfEmpty: true,
            },
        ],
        appModel: {
            name: "MariaDb",
            appType: 'MARIADB',
            sourceType: 'CONTAINER',
            containerImageSource: "",
            ingressNetworkPolicy: Constants.DEFAULT_INGRESS_NETWORK_POLICY_DATABASES,
            egressNetworkPolicy: Constants.DEFAULT_EGRESS_NETWORK_POLICY_DATABASES,
            minReplicas: 1,
            maxReplicas: 1,
            currentReplicas: 1,
            autoScalingEnabled: false,
            cpuThreshold: 70,
            memoryThreshold: 70,
            envVars: ``,
            useNetworkPolicy: true,
            buildMethod: 'DOCKERFILE',
            nodeAffinityType: 'NONE',
            nodeAffinityLabelSelector: '[]',
        },
        appDomains: [],
        appVolumes: [{
            size: 400,
            containerMountPath: '/var/lib/mysql',
            accessMode: 'ReadWriteOnce',
            storageClassName: 'longhorn',
        }],
        appFileMounts: [],
        appPorts: [{
            port: 3306,
        }]
    }]
}
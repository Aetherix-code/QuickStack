import { Constants } from "@/shared/utils/constants";
import { AppTemplateModel } from "../../model/app-template.model";

export const mongodbAppTemplate: AppTemplateModel = {
    name: "MongoDB",
    iconName: 'mongodb.svg',
    templates: [{
        inputSettings: [
            {
                key: "containerImageSource",
                label: "Container Image",
                value: "mongo:7",
                isEnvVar: false,
                randomGeneratedIfEmpty: false,
            },
            {
                key: "MONGO_INITDB_DATABASE",
                label: "Database Name",
                value: "mongodb",
                isEnvVar: true,
                randomGeneratedIfEmpty: false,
            },
            {
                key: "MONGO_INITDB_ROOT_USERNAME",
                label: "Username",
                value: "mongodbuser",
                isEnvVar: true,
                randomGeneratedIfEmpty: false,
            },
            {
                key: "MONGO_INITDB_ROOT_PASSWORD",
                label: "Password",
                value: "",
                isEnvVar: true,
                randomGeneratedIfEmpty: true,
            },
        ],
        appModel: {
            name: "MongoDB",
            appType: 'MONGODB',
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
        },
        appDomains: [],
        appVolumes: [{
            size: 500,
            containerMountPath: '/data/db',
            accessMode: 'ReadWriteOnce',
            storageClassName: 'longhorn',
        }],
        appFileMounts: [],
        appPorts: [{
            port: 27017,
        }]
    }],
};
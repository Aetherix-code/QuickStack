'use client'

import { NodeInfoModel } from "@/shared/model/node-info.model";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Code } from "@/components/custom/code";
import { Toast } from "@/frontend/utils/toast.utils";
import { Button } from "@/components/ui/button";
import { useBreadcrumbs, useConfirmDialog } from "@/frontend/states/zustand.states";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { setNodeStatus, deleteNode } from "./actions";
import AddClusterNodeDialog from "./add-cluster-node-dialog";
import NodeLabelsDialog from "./node-labels-dialog";

export default function NodeInfo({ nodeInfos, clusterJoinToken }: { nodeInfos: NodeInfoModel[]; clusterJoinToken?: string; }) {

    const { openConfirmDialog: openDialog } = useConfirmDialog();

    const setNodeStatusClick = async (nodeName: string, schedulable: boolean) => {
        const confirmation = await openDialog({
            title: 'Update Node Status',
            description: `Do you really want to ${schedulable ? 'activate' : 'deactivate'} Node ${nodeName}? ${!schedulable ? 'This will stop all running containers on this node and moves the workload to the other nodes. Future workloads won\'t be scheduled on this node.' : ''}`,
            okButton: 'Yes',
            cancelButton: 'cancel'
        });
        if (confirmation) {
            Toast.fromAction(() => setNodeStatus(nodeName, schedulable));
        }
    }

    const deleteNodeClick = async (nodeName: string) => {
        const confirmation = await openDialog({
            title: 'Remove Node',
            description: `Are you sure you want to remove node "${nodeName}" from the cluster? This action cannot be undone.`,
            okButton: 'Remove',
            cancelButton: 'Cancel'
        });
        if (confirmation) {
            Toast.fromAction(() => deleteNode(nodeName));
        }
    }

    return (
        <Card>
            <CardHeader className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div>
                    <CardTitle>Nodes</CardTitle>
                    <CardDescription>Overview of all Nodes in your Cluster</CardDescription>
                </div>
                <div className="flex justify-end">
                    <AddClusterNodeDialog clusterJoinToken={clusterJoinToken}>
                        <Button>Add Cluster Node</Button>
                    </AddClusterNodeDialog>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {nodeInfos.map((nodeInfo, index) => (
                        <div key={index} className="space-y-4 rounded-lg border">
                            <h3 className={(nodeInfo.status && nodeInfo.schedulable ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700') + ' p-4 rounded-t-lg font-semibold text-xl text-center'}>
                                Node {index + 1}
                            </h3>
                            <div className="space-y-2 px-4 pb-2">
                                <div className="flex justify-center gap-4">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild><div className={(nodeInfo.pidOk ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700') + ' px-3 py-1.5 rounded cursor-pointer'}>CPU</div></TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-[350px]">{nodeInfo.pidStatusText}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className={(nodeInfo.memoryOk ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700') + ' px-3 py-1.5 rounded cursor-pointer'}>RAM</div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-[350px]">{nodeInfo.memoryStatusText}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className={(nodeInfo.diskOk ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700') + ' px-3 py-1.5 rounded cursor-pointer'}>Disk</div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-[350px]">{nodeInfo.diskStatusText}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>


                                </div>
                                <div className="pt-2">
                                    <span className="font-semibold">Name:</span> <Code>{nodeInfo.name}</Code>
                                </div>
                                <div>
                                    <span className="font-semibold">Schedulable:</span>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className={nodeInfo.schedulable ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold'}> {nodeInfo.schedulable ? 'Yes' : 'No'}</span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-[350px]">{nodeInfo.schedulable ? 'Node is ready to run containers.' : 'Node ist deactivated. All containers will be scheduled on other nodes.'}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                                <div>
                                    <span className="font-semibold">IP:</span> <Code>{nodeInfo.ip}</Code>
                                </div>
                                <div className="text-xs text-slate-500 pt-2">
                                    <span className="font-semibold">Master Node:</span> {nodeInfo.isMasterNode ? 'Yes' : 'No'}<br />
                                    <span className="font-semibold">Spec:</span> {nodeInfo.cpuCapacity} CPU Cores, {nodeInfo.ramCapacity} Memory<br />
                                    <span className="font-semibold">OS:</span> {nodeInfo.os} | {nodeInfo.architecture}<br />
                                    <span className="font-semibold">Kernel Version:</span> {nodeInfo.kernelVersion}<br />
                                    <span className="font-semibold">Container Runtime Version:</span> {nodeInfo.containerRuntimeVersion}<br />
                                    <span className="font-semibold">Kube Proxy Version:</span> {nodeInfo.kubeProxyVersion}<br />
                                    <span className="font-semibold">Kubelet Version:</span> {nodeInfo.kubeletVersion}
                                </div>
                            </div>
                            {index !== 0 && <div className="flex flex-wrap px-4 pb-4 gap-4">
                                <Button onClick={() => setNodeStatusClick(nodeInfo.name, !nodeInfo.schedulable)} variant="outline">{nodeInfo.schedulable ? 'Deactivate' : 'Activate'} Node</Button>
                                <NodeLabelsDialog nodeName={nodeInfo.name} labels={nodeInfo.labels}>
                                    <Button variant="outline">Labels{Object.keys(nodeInfo.labels).length > 0 && ` (${Object.keys(nodeInfo.labels).length})`}</Button>
                                </NodeLabelsDialog>
                                <Button onClick={() => deleteNodeClick(nodeInfo.name)} variant="outline" className="text-destructive">Remove Node</Button>
                            </div>}
                            {index === 0 && <div className="flex flex-wrap px-4 pb-4 gap-4">
                                <NodeLabelsDialog nodeName={nodeInfo.name} labels={nodeInfo.labels}>
                                    <Button variant="outline">Labels{Object.keys(nodeInfo.labels).length > 0 && ` (${Object.keys(nodeInfo.labels).length})`}</Button>
                                </NodeLabelsDialog>
                            </div>}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}

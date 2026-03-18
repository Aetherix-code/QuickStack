'use client'

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "../ui/button";
import FullLoadingSpinner from "../ui/full-loading-spinnter";

interface AppOnNodeInfo {
    appId: string;
    appName: string;
    projectId: string;
    projectName: string;
    podCount: number;
}

export default function NodeAppsList({
    nodeName,
    getAllAppsWithPods
}: {
    nodeName: string;
    getAllAppsWithPods: () => Promise<any>;
}) {
    const [apps, setApps] = useState<AppOnNodeInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchApps = async () => {
            try {
                const response = await getAllAppsWithPods();
                if (response.status === 'success' && response.data) {
                    // Filter apps that have pods on this node
                    const appsOnNode: AppOnNodeInfo[] = [];

                    for (const project of response.data) {
                        for (const app of project.apps) {
                            const podsOnNode = app.pods?.filter((pod: any) => pod.nodeName === nodeName) || [];
                            if (podsOnNode.length > 0) {
                                appsOnNode.push({
                                    appId: app.id,
                                    appName: app.name,
                                    projectId: project.id,
                                    projectName: project.name,
                                    podCount: podsOnNode.length
                                });
                            }
                        }
                    }

                    setApps(appsOnNode);
                }
            } catch (error) {
                console.error('Error fetching apps for node:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchApps();
    }, [nodeName]);

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Apps on this Node</CardTitle>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <FullLoadingSpinner />
                ) : apps.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No apps running on this node</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Project</TableHead>
                                <TableHead>App</TableHead>
                                <TableHead>Pods</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {apps.map((app) => (
                                <TableRow key={app.appId}>
                                    <TableCell className="text-xs">{app.projectName}</TableCell>
                                    <TableCell className="text-xs">{app.appName}</TableCell>
                                    <TableCell className="text-xs">{app.podCount}</TableCell>
                                    <TableCell>
                                        <Link href={`/project/app/${app.appId}`}>
                                            <Button variant="ghost" size="sm">
                                                <ExternalLink className="h-3 w-3" />
                                            </Button>
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}

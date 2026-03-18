'use client'

import { useEffect, useState } from "react";
import { Code } from "./code";

export default function AppNodesDisplay({
    appId,
    getPodsForApp
}: {
    appId: string;
    getPodsForApp: (appId: string) => Promise<any>;
}) {
    const [nodes, setNodes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNodes = async () => {
            try {
                const response = await getPodsForApp(appId);
                if (response.status === 'success' && response.data) {
                    const uniqueNodes = Array.from(new Set(
                        response.data
                            .map((pod: any) => pod.nodeName)
                            .filter((name: any) => !!name)
                    )) as string[];
                    setNodes(uniqueNodes);
                }
            } catch (error) {
                console.error('Error fetching nodes for app:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchNodes();
    }, [appId]);

    if (loading) {
        return <span className="text-xs text-gray-500">Loading...</span>;
    }

    if (nodes.length === 0) {
        return <span className="text-xs text-gray-500">-</span>;
    }

    return (
        <div className="flex flex-wrap gap-1">
            {nodes.map((node, idx) => (
                <Code key={idx} className="text-xs" copieable={false}>{node}</Code>
            ))}
        </div>
    );
}

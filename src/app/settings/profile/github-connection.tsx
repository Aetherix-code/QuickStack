'use client';

import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";
import { signIn } from "next-auth/react";
import { disconnectGitHub } from "./actions";
import { Toast } from "@/frontend/utils/toast.utils";

export default function GitHubConnectionSettings({
    githubUsername,
    githubConnected
}: {
    githubUsername?: string | null;
    githubConnected: boolean;
}) {
    const handleConnect = () => {
        signIn('github', { callbackUrl: '/settings/profile' });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Github className="h-5 w-5" />
                    GitHub Integration
                </CardTitle>
                <CardDescription>
                    Connect your GitHub account to easily deploy repositories and enable auto-deployment.
                </CardDescription>
            </CardHeader>
            <CardFooter className="gap-4 flex-col items-start">
                {githubConnected ? (
                    <>
                        <div className="text-sm">
                            <span className="font-semibold">Connected as:</span> <code className="bg-muted px-2 py-1 rounded">{githubUsername}</code>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={handleConnect}
                            >
                                Reconnect GitHub
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => Toast.fromAction(() => disconnectGitHub())}
                            >
                                Disconnect
                            </Button>
                        </div>
                    </>
                ) : (
                    <Button onClick={handleConnect}>
                        <Github className="mr-2 h-4 w-4" />
                        Connect GitHub Account
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}

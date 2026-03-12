'use client';

import { SubmitButton } from "@/components/custom/submit-button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormUtils } from "@/frontend/utils/form.utilts";
import { AppSourceInfoInputModel, appSourceInfoInputZodModel } from "@/shared/model/app-source-info.model";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { saveGeneralAppSourceInfo, getCurrentUserGitHubConnection } from "./actions";
import { useFormState } from "react-dom";
import { ServerActionResult } from "@/shared/model/server-action-error-return.model";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppExtendedModel } from "@/shared/model/app-extended.model";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getGitHubRepos, getGitHubBranches } from "@/app/settings/profile/github-actions";
import { GitHubRepo, GitHubBranch } from "@/server/services/github.service";
import { AlertCircle, Github, Loader2 } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function GeneralAppSource({ app, readonly }: {
    app: AppExtendedModel;
    readonly: boolean;
}) {
    const [hasGitHub, setHasGitHub] = useState<boolean | null>(null);
    const [repos, setRepos] = useState<GitHubRepo[]>([]);
    const [branches, setBranches] = useState<GitHubBranch[]>([]);
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [repoSearchTerm, setRepoSearchTerm] = useState("");

    const form = useForm<AppSourceInfoInputModel>({
        resolver: zodResolver(appSourceInfoInputZodModel),
        defaultValues: {
            ...app,
            sourceType: app.sourceType as 'GIT' | 'CONTAINER',
            buildMethod: (app.buildMethod as 'DOCKERFILE' | 'AUTO' | null | undefined) || 'DOCKERFILE'
        },
        disabled: readonly,
    });

    const [state, formAction] = useFormState((state: ServerActionResult<any, any>, payload: AppSourceInfoInputModel) => saveGeneralAppSourceInfo(state, payload, app.id), FormUtils.getInitialFormState<typeof appSourceInfoInputZodModel>());

    // Derive the selected repo full_name from the current gitUrl
    const currentGitUrl = form.watch('gitUrl');
    const selectedRepoFullName = useMemo(() => {
        if (!currentGitUrl || repos.length === 0) return undefined;
        const match = repos.find(r => r.clone_url === currentGitUrl);
        return match?.full_name;
    }, [currentGitUrl, repos]);

    useEffect(() => {
        getCurrentUserGitHubConnection().then(result => {
            if (result.status === 'success') {
                const connected = result.data.hasGitHub;
                setHasGitHub(connected);
                if (connected) {
                    loadRepos();
                }
            } else {
                setHasGitHub(false);
            }
        });
    }, []);

    const loadRepos = async () => {
        setLoadingRepos(true);
        try {
            const result = await getGitHubRepos();
            if (result.status === 'success') {
                setRepos(result.data);
            }
        } catch (error) {
            console.error('Failed to load repos:', error);
        } finally {
            setLoadingRepos(false);
        }
    };

    const handleRepoSelect = async (repoFullName: string) => {
        const repo = repos.find(r => r.full_name === repoFullName);
        if (!repo) return;

        form.setValue('gitUrl', repo.clone_url);
        form.setValue('gitBranch', repo.default_branch);

        setLoadingBranches(true);
        try {
            const [owner, repoName] = repo.full_name.split('/');
            const result = await getGitHubBranches(owner, repoName);
            if (result.status === 'success') {
                setBranches(result.data);
            }
        } catch (error) {
            console.error('Failed to load branches:', error);
        } finally {
            setLoadingBranches(false);
        }
    };

    // Load branches for already-configured repo on mount
    useEffect(() => {
        if (repos.length > 0 && currentGitUrl) {
            const match = repos.find(r => r.clone_url === currentGitUrl);
            if (match) {
                const [owner, repoName] = match.full_name.split('/');
                setLoadingBranches(true);
                getGitHubBranches(owner, repoName).then(result => {
                    if (result.status === 'success') {
                        setBranches(result.data);
                    }
                }).finally(() => setLoadingBranches(false));
            }
        }
    }, [repos]);

    useEffect(() => {
        if (state.status === 'success') {
            toast.success('Source Info Saved', {
                description: "Click \"deploy\" to apply the changes to your app.",
            });
        }
        FormUtils.mapValidationErrorsToForm<typeof appSourceInfoInputZodModel>(state, form)
    }, [state]);

    const sourceTypeField = form.watch();
    const buildMethodField = form.watch('buildMethod');

    const filteredRepos = repos.filter(repo =>
        repo.name.toLowerCase().includes(repoSearchTerm.toLowerCase()) ||
        repo.full_name.toLowerCase().includes(repoSearchTerm.toLowerCase())
    );

    return <>
        <Card>
            <CardHeader>
                <CardTitle>Source</CardTitle>
                <CardDescription>Provide Information about the Source of your Application.</CardDescription>
            </CardHeader>
            <Form {...form}>
                <form action={(e) => form.handleSubmit((data) => {
                    return formAction(data);
                })()}>
                    <CardContent className="space-y-4">
                        <div className="hidden">
                            <FormField
                                control={form.control}
                                name="sourceType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Source Type</FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value as string | number | readonly string[] | undefined} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="gitUrl"
                                render={({ field }) => (
                                    <Input {...field} value={field.value as string | number | readonly string[] | undefined} />
                                )}
                            />
                        </div>
                        <Label>Source Type</Label>
                        <Tabs defaultValue="GIT" value={sourceTypeField.sourceType} onValueChange={(val) => {
                            form.setValue('sourceType', val as 'GIT' | 'CONTAINER');
                        }} className="mt-2">
                            <TabsList>
                                {app.appType === 'APP' && <TabsTrigger value="GIT">Git</TabsTrigger>}
                                <TabsTrigger value="CONTAINER">Docker Container</TabsTrigger>
                            </TabsList>
                            <TabsContent value="GIT" className="space-y-4 mt-4">
                                {hasGitHub === null ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin" />
                                    </div>
                                ) : !hasGitHub ? (
                                    <Alert>
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>GitHub Not Connected</AlertTitle>
                                        <AlertDescription>
                                            Connect your GitHub account to deploy from your repositories.{' '}
                                            <Link href="/settings/profile" className="underline font-medium">
                                                Go to Settings
                                            </Link>
                                        </AlertDescription>
                                    </Alert>
                                ) : (
                                    <>
                                        {loadingRepos ? (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Loading repositories...
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <Label>Repository</Label>
                                                <Select
                                                    onValueChange={handleRepoSelect}
                                                    value={selectedRepoFullName}
                                                    disabled={readonly}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select a GitHub repository" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <div className="p-2">
                                                            <Input
                                                                placeholder="Search repositories..."
                                                                value={repoSearchTerm}
                                                                onChange={(e) => setRepoSearchTerm(e.target.value)}
                                                                className="h-8"
                                                            />
                                                        </div>
                                                        <div className="max-h-[300px] overflow-y-auto">
                                                            {filteredRepos.map((repo) => (
                                                                <SelectItem key={repo.id} value={repo.full_name}>
                                                                    <div className="flex items-center gap-2">
                                                                        <Github className="h-3 w-3 shrink-0" />
                                                                        <span className="font-medium">{repo.full_name}</span>
                                                                        {repo.private && (
                                                                            <span className="text-xs text-muted-foreground">(Private)</span>
                                                                        )}
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                            {filteredRepos.length === 0 && (
                                                                <div className="py-4 text-center text-sm text-muted-foreground">
                                                                    No repositories found
                                                                </div>
                                                            )}
                                                        </div>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <Label>Branch</Label>
                                            {loadingBranches ? (
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Loading branches...
                                                </div>
                                            ) : (
                                                <Select
                                                    onValueChange={(val) => form.setValue('gitBranch', val)}
                                                    value={form.watch('gitBranch') || ''}
                                                    disabled={readonly || branches.length === 0}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select a branch" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {branches.map((branch) => (
                                                            <SelectItem key={branch.name} value={branch.name}>
                                                                {branch.name} {branch.protected && '(Protected)'}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </div>

                                        <FormField
                                            control={form.control}
                                            name="buildMethod"
                                            render={({ field }) => (
                                                <FormItem className="space-y-3">
                                                    <FormLabel>Build Method</FormLabel>
                                                    <FormControl>
                                                        <RadioGroup
                                                            onValueChange={field.onChange}
                                                            defaultValue={field.value || 'DOCKERFILE'}
                                                            value={field.value || 'DOCKERFILE'}
                                                            className="flex flex-col space-y-1"
                                                        >
                                                            <FormItem className="flex items-center space-x-3 space-y-0">
                                                                <FormControl>
                                                                    <RadioGroupItem value="DOCKERFILE" />
                                                                </FormControl>
                                                                <FormLabel className="font-normal">
                                                                    Dockerfile (use existing Dockerfile)
                                                                </FormLabel>
                                                            </FormItem>
                                                            <FormItem className="flex items-center space-x-3 space-y-0">
                                                                <FormControl>
                                                                    <RadioGroupItem value="AUTO" />
                                                                </FormControl>
                                                                <FormLabel className="font-normal">
                                                                    Auto-detect (automatically detect and build)
                                                                </FormLabel>
                                                            </FormItem>
                                                        </RadioGroup>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {buildMethodField === 'DOCKERFILE' && (
                                            <FormField
                                                control={form.control}
                                                name="dockerfilePath"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Path to Dockerfile</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="./Dockerfile"  {...field} value={field.value as string | number | readonly string[] | undefined} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </>
                                )}
                            </TabsContent>
                            <TabsContent value="CONTAINER" className="space-y-4 mt-4">
                                <FormField
                                    control={form.control}
                                    name="containerImageSource"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Docker Image Name</FormLabel>
                                            <FormControl>
                                                <Input   {...field} value={field.value as string | number | readonly string[] | undefined} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="grid grid-cols-2 gap-4">

                                    <FormField
                                        control={form.control}
                                        name="containerRegistryUsername"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Registry Username</FormLabel>
                                                <FormControl>
                                                    <Input {...field} value={field.value as string | number | readonly string[] | undefined} />
                                                </FormControl>
                                                <FormDescription>Only required if your image is stored in a private registry.</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="containerRegistryPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Registry Password</FormLabel>
                                                <FormControl>
                                                    <Input type="password" {...field} value={field.value as string | number | readonly string[] | undefined} />
                                                </FormControl>
                                                <FormDescription>Only required if your image is stored in a private registry.</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                    {!readonly && <CardFooter className="gap-4">
                        <SubmitButton>Save</SubmitButton>
                        <p className="text-red-500">{state?.message}</p>
                    </CardFooter>}
                </form>
            </Form >
        </Card >
    </>;
}
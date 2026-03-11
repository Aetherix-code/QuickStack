'use client';

import { SubmitButton } from "@/components/custom/submit-button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormUtils } from "@/frontend/utils/form.utilts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useFormState } from "react-dom";
import { ServerActionResult } from "@/shared/model/server-action-error-return.model";
import { Input } from "@/components/ui/input";
import { useEffect } from "react";
import { toast } from "sonner";
import { QsGitHubSettingsModel, qsGitHubSettingsZodModel } from "@/shared/model/qs-github-settings.model";
import { updateGitHubSettings } from "./actions";

export default function QuickStackGitHubSettings({
    githubClientId,
    githubClientSecret,
}: {
    githubClientId: string;
    githubClientSecret: string;
}) {
    const form = useForm<QsGitHubSettingsModel>({
        resolver: zodResolver(qsGitHubSettingsZodModel),
        defaultValues: {
            githubClientId,
            githubClientSecret,
        }
    });

    const [state, formAction] = useFormState((state: ServerActionResult<any, any>, payload: QsGitHubSettingsModel) =>
        updateGitHubSettings(state, payload), FormUtils.getInitialFormState<typeof qsGitHubSettingsZodModel>());

    useEffect(() => {
        if (state.status === 'success') {
            toast.success('GitHub OAuth settings updated successfully.');
        }
        FormUtils.mapValidationErrorsToForm<typeof qsGitHubSettingsZodModel>(state, form)
    }, [state]);

    return <>
        <Card>
            <CardHeader>
                <CardTitle>GitHub OAuth</CardTitle>
                <CardDescription>
                    Configure GitHub OAuth credentials for login and repository integration.
                    Create an OAuth App in your <a href="https://github.com/settings/developers" target="_blank" rel="noopener noreferrer" className="underline">GitHub Developer Settings</a>.
                </CardDescription>
            </CardHeader>
            <Form {...form}>
                <form action={(e) => form.handleSubmit((data) => {
                    return formAction(data);
                })()}>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="githubClientId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Client ID</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ov23li..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="githubClientSecret"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Client Secret</FormLabel>
                                    <FormControl>
                                        <Input type="password" placeholder="••••••••" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        The client secret from your GitHub OAuth App.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                    <CardFooter className="gap-4">
                        <SubmitButton>Save</SubmitButton>
                        <p className="text-red-500">{state?.message}</p>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    </>;
}

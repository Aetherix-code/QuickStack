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
import { StaleNodeCleanupSettingsModel, staleNodeCleanupSettingsZodModel } from "@/shared/model/stale-node-cleanup-settings.model";
import { updateStaleNodeCleanupSettings } from "./actions";
import CheckboxFormField from "@/components/custom/checkbox-form-field";

export default function QuickStackStaleNodeCleanupSettings({
    enabled,
    thresholdMinutes,
}: {
    enabled: boolean;
    thresholdMinutes: number;
}) {
    const form = useForm<StaleNodeCleanupSettingsModel>({
        resolver: zodResolver(staleNodeCleanupSettingsZodModel),
        defaultValues: { enabled, thresholdMinutes }
    });

    const [state, formAction] = useFormState(
        (state: ServerActionResult<any, any>, payload: StaleNodeCleanupSettingsModel) =>
            updateStaleNodeCleanupSettings(state, payload),
        FormUtils.getInitialFormState<typeof staleNodeCleanupSettingsZodModel>()
    );

    useEffect(() => {
        if (state.status === 'success') {
            toast.success('Stale node cleanup settings updated.');
        }
        FormUtils.mapValidationErrorsToForm<typeof staleNodeCleanupSettingsZodModel>(state, form);
    }, [state]);

    const isEnabled = form.watch('enabled');

    return (
        <Card>
            <CardHeader>
                <CardTitle>Stale Node Cleanup</CardTitle>
                <CardDescription>
                    Automatically remove nodes that have been NotReady for longer than the threshold.
                    Useful for auto-scaling groups and spot instances that leave behind ghost nodes.
                </CardDescription>
            </CardHeader>
            <Form {...form}>
                <form action={() => form.handleSubmit((data) => formAction(data))()}>
                    <CardContent className="space-y-4">
                        <CheckboxFormField
                            form={form}
                            name="enabled"
                            label="Enable automatic stale node cleanup"
                        />
                        {isEnabled && (
                            <FormField
                                control={form.control}
                                name="thresholdMinutes"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Threshold (minutes)</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                min="1"
                                                max="1440"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Nodes that are NotReady for longer than this will be removed. Check runs every 2 minutes.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                    </CardContent>
                    <CardFooter className="gap-4">
                        <SubmitButton>Save</SubmitButton>
                        <p className="text-red-500">{state?.message}</p>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}

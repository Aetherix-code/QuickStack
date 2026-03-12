'use client';

import { SubmitButton } from "@/components/custom/submit-button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { FormUtils } from "@/frontend/utils/form.utilts";
import { AppSourceInfoInputModel, appSourceInfoInputZodModel } from "@/shared/model/app-source-info.model";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { saveGeneralAppRateLimits, saveGeneralAppSourceInfo } from "./actions";
import { useFormState } from "react-dom";
import { ServerActionResult } from "@/shared/model/server-action-error-return.model";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { AppRateLimitsModel, appRateLimitsZodModel } from "@/shared/model/app-rate-limits.model";
import { App } from "@prisma/client";
import { useEffect } from "react";
import { toast } from "sonner";
import { AppExtendedModel } from "@/shared/model/app-extended.model";
import { cn } from "@/frontend/utils/utils";
import { Switch } from "@/components/ui/switch";


export default function GeneralAppRateLimits({ app, readonly }: {
    app: AppExtendedModel;
    readonly: boolean;
}) {
    const form = useForm<AppRateLimitsModel>({
        resolver: zodResolver(appRateLimitsZodModel),
        defaultValues: app,
        disabled: readonly
    });

    const [state, formAction] = useFormState((state: ServerActionResult<any, any>, payload: AppRateLimitsModel) => saveGeneralAppRateLimits(state, payload, app.id), FormUtils.getInitialFormState<typeof appRateLimitsZodModel>());
    useEffect(() => {
        if (state.status === 'success') {
            toast.success('Rate Limits Saved', {
                description: "Click \"deploy\" to apply the changes to your app.",
            });
        }
        FormUtils.mapValidationErrorsToForm<typeof appRateLimitsZodModel>(state, form);
    }, [state]);

    return <>
        <Card>
            <CardHeader>
                <CardTitle>Container Configuration</CardTitle>
                <CardDescription>Provide optional rate Limits per running container instance.</CardDescription>
            </CardHeader>
            <Form {...form}>
                <form action={(e) => form.handleSubmit((data) => {
                    return formAction(data);
                })()}>
                    <CardContent className="space-y-4">
                        <div className={cn('space-y-4', app.appType !== 'APP' && 'hidden')}>
                            <FormField
                                control={form.control}
                                name="autoScalingEnabled"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-base">Enable Auto-scaling (HPA)</FormLabel>
                                            <FormDescription>
                                                Automatically scale replicas based on CPU and memory usage
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            {!form.watch('autoScalingEnabled') && (
                                <FormField
                                    control={form.control}
                                    name="currentReplicas"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Replicas</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    placeholder="1"
                                                    {...field}
                                                    value={field.value}
                                                    onChange={(e) => {
                                                        const value = e.target.value === '' ? 1 : parseInt(e.target.value) || 1;
                                                        form.setValue('currentReplicas', value);
                                                        form.setValue('minReplicas', value);
                                                        form.setValue('maxReplicas', value);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                Number of container instances to run
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            {form.watch('autoScalingEnabled') && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="minReplicas"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Min Replicas</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            placeholder="1"
                                                            {...field}
                                                            value={field.value}
                                                            onChange={(e) => {
                                                                const value = e.target.value === '' ? 1 : parseInt(e.target.value) || 1;
                                                                field.onChange(value);
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="maxReplicas"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Max Replicas</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            placeholder="10"
                                                            {...field}
                                                            value={field.value}
                                                            onChange={(e) => {
                                                                const value = e.target.value === '' ? 10 : parseInt(e.target.value) || 10;
                                                                field.onChange(value);
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="cpuThreshold"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>CPU Threshold (%)</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            max="100"
                                                            placeholder="70"
                                                            {...field}
                                                            value={field.value}
                                                            onChange={(e) => {
                                                                const value = e.target.value === '' ? 70 : parseInt(e.target.value);
                                                                field.onChange(value);
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormDescription>
                                                        Scale up when CPU usage exceeds this % of CPU Reservation (request)
                                                        {!app.cpuReservation && <span className="text-amber-600 block mt-1">⚠️ CPU Reservation must be set for this metric to work</span>}
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="memoryThreshold"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Memory Threshold (%)</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            max="100"
                                                            placeholder="70"
                                                            {...field}
                                                            value={field.value}
                                                            onChange={(e) => {
                                                                const value = e.target.value === '' ? 70 : parseInt(e.target.value);
                                                                field.onChange(value);
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormDescription>
                                                        Scale up when memory usage exceeds this % of Memory Reservation (request)
                                                        {!app.memoryReservation && <span className="text-amber-600 block mt-1">⚠️ Memory Reservation must be set for this metric to work</span>}
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">

                            <FormField
                                control={form.control}
                                name="memoryLimit"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Memory Limit (MB)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} value={field.value as string | number | readonly string[] | undefined} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="memoryReservation"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Memory Reservation (MB)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} value={field.value as string | number | readonly string[] | undefined} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="cpuLimit"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>CPU Limit (m)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} value={field.value as string | number | readonly string[] | undefined} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="cpuReservation"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>CPU Reservation (m)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} value={field.value as string | number | readonly string[] | undefined} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
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
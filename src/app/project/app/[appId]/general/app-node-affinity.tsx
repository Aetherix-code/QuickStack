'use client';

import { SubmitButton } from "@/components/custom/submit-button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormUtils } from "@/frontend/utils/form.utilts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { saveGeneralAppNodeAffinity } from "./actions";
import { useFormState } from "react-dom";
import { ServerActionResult } from "@/shared/model/server-action-error-return.model";
import { useEffect } from "react";
import { toast } from "sonner";
import { AppExtendedModel } from "@/shared/model/app-extended.model";
import { AppNodeAffinityModel, appNodeAffinityZodModel } from "@/shared/model/app-node-affinity.model";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NodeInfoModel } from "@/shared/model/node-info.model";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";


export default function GeneralAppNodeAffinity({ app, readonly, nodesInfo }: {
    app: AppExtendedModel;
    readonly: boolean;
    nodesInfo: NodeInfoModel[];
}) {
    // Parse existing label selectors from JSON string
    const existingLabelSelectors = (() => {
        try {
            return app.nodeAffinityLabelSelector ? JSON.parse(app.nodeAffinityLabelSelector) : [];
        } catch {
            return [];
        }
    })();

    const form = useForm<AppNodeAffinityModel>({
        resolver: zodResolver(appNodeAffinityZodModel),
        defaultValues: {
            nodeAffinityType: app.nodeAffinityType as 'NONE' | 'REQUIRED' | 'PREFERRED',
            nodeAffinityLabelSelector: existingLabelSelectors,
        },
        disabled: readonly
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "nodeAffinityLabelSelector",
    });

    const [state, formAction] = useFormState((state: ServerActionResult<any, any>, payload: AppNodeAffinityModel) => saveGeneralAppNodeAffinity(state, payload, app.id), FormUtils.getInitialFormState<typeof appNodeAffinityZodModel>());
    useEffect(() => {
        if (state.status === 'success') {
            toast.success('Node Affinity Saved', {
                description: "Click \"deploy\" to apply the changes to your app.",
            });
        }
        FormUtils.mapValidationErrorsToForm<typeof appNodeAffinityZodModel>(state, form);
    }, [state]);

    const affinityType = form.watch('nodeAffinityType');

    return <>
        <Card>
            <CardHeader>
                <CardTitle>Node Selection</CardTitle>
                <CardDescription>Configure node affinity using labels to control where your app runs.</CardDescription>
            </CardHeader>
            <Form {...form}>
                <form action={(e) => form.handleSubmit((data) => {
                    return formAction(data);
                })()}>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="nodeAffinityType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Node Affinity Type</FormLabel>
                                    <Select
                                        disabled={readonly}
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select affinity type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="NONE">None - Run on any node</SelectItem>
                                            <SelectItem value="PREFERRED">Preferred - Prefer nodes with matching labels</SelectItem>
                                            <SelectItem value="REQUIRED">Required - Only nodes with matching labels</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        Choose how strictly to enforce node placement.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {(affinityType === 'REQUIRED' || affinityType === 'PREFERRED') && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <FormLabel>Node Label Selectors</FormLabel>
                                        <FormDescription>
                                            Add labels to match nodes (e.g., disktype=ssd, environment=prod){affinityType === 'PREFERRED' && <><br />Higher weights are preferred more strongly (1-100)</>}
                                        </FormDescription>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={readonly}
                                        onClick={() => append({ key: '', value: '', weight: affinityType === 'PREFERRED' ? 100 : undefined })}
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Label
                                    </Button>
                                </div>

                                {fields.length === 0 && (
                                    <div className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
                                        No labels added. Click "Add Label" to add node selectors.
                                    </div>
                                )}

                                {fields.map((field, index) => (
                                    <div key={field.id} className="flex gap-2 items-start border rounded-lg p-4">
                                        <FormField
                                            control={form.control}
                                            name={`nodeAffinityLabelSelector.${index}.key`}
                                            render={({ field }) => (
                                                <FormItem className="flex-1">
                                                    <FormLabel>Label Key</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="e.g., disktype"
                                                            {...field}
                                                            disabled={readonly}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`nodeAffinityLabelSelector.${index}.value`}
                                            render={({ field }) => (
                                                <FormItem className="flex-1">
                                                    <FormLabel>Label Value</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="e.g., ssd"
                                                            {...field}
                                                            disabled={readonly}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        {affinityType === 'PREFERRED' && (
                                            <FormField
                                                control={form.control}
                                                name={`nodeAffinityLabelSelector.${index}.weight`}
                                                render={({ field }) => (
                                                    <FormItem className="w-32">
                                                        <FormLabel>Weight</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                min="1"
                                                                max="100"
                                                                placeholder="1-100"
                                                                {...field}
                                                                onChange={(e) => field.onChange(parseInt(e.target.value) || 100)}
                                                                value={field.value || 100}
                                                                disabled={readonly}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                        <div className="pt-8">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                disabled={readonly}
                                                onClick={() => remove(index)}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}

                                {nodesInfo.length > 0 && (
                                    <div className="text-sm text-muted-foreground border rounded-lg p-4">
                                        <div className="font-semibold mb-2">Available nodes in cluster:</div>
                                        {nodesInfo.map((node) => (
                                            <div key={node.name} className="ml-2">
                                                • {node.name} ({node.ip}) {!node.schedulable && '- Inactive'}
                                            </div>
                                        ))}
                                        <div className="mt-2 text-xs">
                                            Tip: Use <code className="bg-muted px-1 rounded">kubectl get nodes --show-labels</code> to see node labels
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
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

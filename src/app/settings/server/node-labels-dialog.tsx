'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useState } from "react";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Toast } from "@/frontend/utils/toast.utils";
import { addNodeLabel, removeNodeLabel } from "./actions";
import { useConfirmDialog } from "@/frontend/states/zustand.states";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function NodeLabelsDialog({ children, nodeName, labels }: {
    children: React.ReactNode;
    nodeName: string;
    labels: Record<string, string>;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const { openConfirmDialog } = useConfirmDialog();
    const router = useRouter();

    const labelEntries = Object.entries(labels);

    const handleAdd = async () => {
        const key = newKey.trim();
        const value = newValue.trim();
        if (!key) return;

        await Toast.fromAction(() => addNodeLabel(nodeName, key, value));
        setNewKey('');
        setNewValue('');
        router.refresh();
    };

    const handleRemove = async (key: string) => {
        const confirmed = await openConfirmDialog({
            title: 'Remove Label',
            description: `Remove label "${key}" from node ${nodeName}?`,
            okButton: 'Remove',
            cancelButton: 'Cancel'
        });
        if (confirmed) {
            await Toast.fromAction(() => removeNodeLabel(nodeName, key));
            router.refresh();
        }
    };

    return (
        <>
            <div onClick={() => setIsOpen(true)}>
                {children}
            </div>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-[550px]">
                    <DialogHeader>
                        <DialogTitle>Manage Labels — {nodeName}</DialogTitle>
                        <DialogDescription>
                            Add or remove custom labels on this node. System labels are hidden.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                        {labelEntries.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">No custom labels on this node.</p>
                        )}
                        {labelEntries.map(([key, value]) => (
                            <div key={key} className="flex items-center gap-2 text-sm">
                                <span className="font-mono bg-muted px-2 py-1 rounded flex-1 truncate">{key}</span>
                                <span className="text-muted-foreground">=</span>
                                <span className="font-mono bg-muted px-2 py-1 rounded flex-1 truncate">{value || <span className="text-muted-foreground italic">empty</span>}</span>
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleRemove(key)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            </div>
                        ))}
                    </div>

                    <div className="border-t pt-3">
                        <p className="text-sm font-semibold mb-2">Add Label</p>
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Key"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                                className="flex-1"
                            />
                            <span className="text-muted-foreground">=</span>
                            <Input
                                placeholder="Value"
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                className="flex-1"
                            />
                            <Button onClick={handleAdd} disabled={!newKey.trim()} className="shrink-0">Add</Button>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

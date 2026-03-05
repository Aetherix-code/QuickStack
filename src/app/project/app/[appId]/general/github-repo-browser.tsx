'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Github, Loader2 } from "lucide-react";
import { getGitHubRepos, getGitHubBranches } from "@/app/settings/profile/github-actions";
import { GitHubRepo, GitHubBranch } from "@/server/services/github.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GitHubRepoBrowserProps {
    onSelect: (repoUrl: string, branch: string) => void;
    disabled?: boolean;
}

export default function GitHubRepoBrowser({ onSelect, disabled }: GitHubRepoBrowserProps) {
    const [open, setOpen] = useState(false);
    const [repos, setRepos] = useState<GitHubRepo[]>([]);
    const [branches, setBranches] = useState<GitHubBranch[]>([]);
    const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
    const [selectedBranch, setSelectedBranch] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        if (open && repos.length === 0) {
            loadRepos();
        }
    }, [open]);

    const loadRepos = async () => {
        setLoading(true);
        try {
            const result = await getGitHubRepos();
            if (result.status === 'success') {
                setRepos(result.data);
            }
        } catch (error) {
            console.error('Failed to load repos:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRepoSelect = async (repoFullName: string) => {
        const repo = repos.find(r => r.full_name === repoFullName);
        if (!repo) return;

        setSelectedRepo(repo);
        setSelectedBranch(repo.default_branch);
        
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

    const handleConfirm = () => {
        if (selectedRepo && selectedBranch) {
            onSelect(selectedRepo.clone_url, selectedBranch);
            setOpen(false);
        }
    };

    const filteredRepos = repos.filter(repo =>
        repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        repo.full_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button type="button" variant="outline" disabled={disabled}>
                    <Github className="mr-2 h-4 w-4" />
                    Browse GitHub Repos
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Select GitHub Repository</DialogTitle>
                    <DialogDescription>
                        Choose a repository and branch to deploy from your GitHub account.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label>Search Repositories</Label>
                                <Input
                                    placeholder="Search by name..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Repository</Label>
                                <Select onValueChange={handleRepoSelect} value={selectedRepo?.full_name}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a repository" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px]">
                                        {filteredRepos.map((repo) => (
                                            <SelectItem key={repo.id} value={repo.full_name}>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{repo.name}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {repo.full_name} {repo.private && '(Private)'}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedRepo && (
                                <div className="space-y-2">
                                    <Label>Branch</Label>
                                    {loadingBranches ? (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Loading branches...
                                        </div>
                                    ) : (
                                        <Select onValueChange={setSelectedBranch} value={selectedBranch}>
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
                            )}

                            {selectedRepo && (
                                <div className="rounded-lg border p-3 text-sm">
                                    <div className="font-medium mb-2">Selected:</div>
                                    <div className="text-muted-foreground">
                                        <div>Repository: {selectedRepo.full_name}</div>
                                        <div>Branch: {selectedBranch}</div>
                                        <div className="text-xs mt-1">
                                            URL: {selectedRepo.clone_url}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button 
                        type="button" 
                        onClick={handleConfirm} 
                        disabled={!selectedRepo || !selectedBranch}
                    >
                        Use This Repository
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

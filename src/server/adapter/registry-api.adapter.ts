interface OCIManifest {
    schemaVersion: number;
    mediaType: string;
    config: {
        mediaType: string;
        size: number;
        digest: string;
    };
    layers: Array<{
        mediaType: string;
        size: number;
        digest: string;
    }>;
    annotations: {
        [key: string]: string;
    };
}

// Source: https://distribution.github.io/distribution/spec/api/

// When running in-cluster (production), use the internal service URL.
// In development, the Next.js server runs on the host and must reach the registry via NodePort (30100).
// Set REGISTRY_BASE_URL if your cluster is on another host (e.g. http://192.168.0.92:30100).
const REGISTRY_NODE_PORT = 30100;

class RegistryApiAdapter {

    private get registryBaseUrl(): string {
        if (process.env.REGISTRY_BASE_URL) {
            const url = process.env.REGISTRY_BASE_URL.replace(/\/$/, '');
            return url.startsWith('http') ? url : `http://${url}`;
        }
        if (process.env.NODE_ENV === 'production') {
            return 'http://registry-svc.registry-and-build.svc.cluster.local:5000';
        }
        return `http://localhost:${REGISTRY_NODE_PORT}`;
    }

    async getAllImages() {

        const response = await fetch(`${this.registryBaseUrl}/v2/_catalog`, {
            cache: 'no-cache',
            method: 'GET',
            headers: {

                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        await this.checkIfResponseIsOk(response);
        const data = await response.json();
        return data?.repositories ?? [] as string[];
    }

    async listTagsForImage(imageName: string) {

        const response = await fetch(`${this.registryBaseUrl}/v2/${imageName}/tags/list`, {
            cache: 'no-cache',
            method: 'GET',
            headers: {

                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });


        if (!response.ok) {
            console.error(`Error while fetching ${response.url} ${response.status} ${response.statusText}`);
            console.error(response.headers);
            console.error(response);
            try {
                const resText = await response.text();
                if (resText.includes('NAME_UNKNOWN')) {
                    // manifest was deleted but repository name still exists in catalog
                    return [];
                }
                console.error(resText);
            } catch (error) {
                // do nothing
            }
            throw new Error(`Error while connecting to container registry.`);
        }

        const data = await response.json();
        return data?.tags ?? [] as string[];
    }

    async getManifest(repository: string, tag: string) {
        const response = await this.manifestRequest(repository, tag);
        const data = await response.json() as OCIManifest;
        return data;
    }

    async getManifestWithDigest(repository: string, tag: string) {

        const response = await this.manifestRequest(repository, tag);
        const digest = response.headers.get("Docker-Content-Digest");
        if (!digest) {
            console.error(response.headers);
            throw new Error("Digest not found in response headers.");
        }
        return [digest, await response.json()] as [string, OCIManifest];
    }

    private async manifestRequest(repository: string, tag: string) {
        const response = await fetch(`${this.registryBaseUrl}/v2/${repository}/manifests/${tag}`, {
            cache: 'no-cache',
            method: 'GET',
            headers: {
                "Accept": [
                    'application/vnd.oci.image.manifest.v1+json',
                    'application/vnd.oci.image.index.v1+json',
                    'application/vnd.docker.distribution.manifest.v2+json',
                    'application/vnd.docker.distribution.manifest.v1+json',
                    'application/vnd.docker.container.image.v1+json',
                    'application/vnd.docker.image.rootfs.diff.tar.gzip',
                    'application/vnd.docker.image.rootfs.foreign.diff.tar.gzip',
                    'application/vnd.docker.image.rootfs.diff.tar',
                    'application/vnd.oci.image.layer.v1.tar+gzip',
                    'application/vnd.docker.plugin.v1+json'
                ].join(', ')
            }
        });

        await this.checkIfResponseIsOk(response);
        return response;
    }

    private async deleteBlob(repository: string, digest: string) {
        const response = await fetch(`${this.registryBaseUrl}/v2/${repository}/blobs/${digest}`, {
            cache: 'no-cache',
            method: 'DELETE'
        });

        await this.checkIfResponseIsOk(response);
        return response;
    }

    private async deleteManifest(repository: string, digest: string) {
        const response = await fetch(`${this.registryBaseUrl}/v2/${repository}/manifests/${digest}`, {
            cache: 'no-cache',
            method: 'DELETE'
        });

        await this.checkIfResponseIsOk(response);
        return response;
    }

    async deleteImage(repository: string, tag: string) {

        // Step 1: Get the digest of the image
        const [digest, manifest] = await this.getManifestWithDigest(repository, tag);

        console.log(`Digest for ${repository}:${tag} is ${digest}`);

        await Promise.all(manifest.layers.map(async (layer) => {
            console.log(`Deleting blob ${layer.digest} (size: ${layer.size})`);
            try {
                await this.deleteBlob(repository, layer.digest);
            } catch (error) {
                console.error(`Error while deleting blob ${layer.digest}`);
            }
        }));

        console.log(`Deleting manifest ${digest}`);
        await this.deleteManifest(repository, digest);

        console.log(`Image ${repository}:${tag} (size: ${manifest?.config?.size}) successfully deleted from registry.`);

        // return the size of the image
        const totalSize = manifest?.layers?.reduce((sum, layer) => sum + (layer.size || 0), 0) ?? 0;
        return totalSize;
    }

    private async checkIfResponseIsOk(response: Response) {
        if (!response.ok) {
            console.error(`Error while fetching ${response.url} ${response.status} ${response.statusText}`);
            console.error(response.headers);
            console.error(response);
            try {
                console.error(await response.text());
            } catch (error) {
                // do nothing
            }
            throw new Error(`Error while connecting to container registry.`);
        }
    }
}
const registryApiAdapter = new RegistryApiAdapter();
export default registryApiAdapter;
import { BlobReader, ZipReader, Uint8ArrayWriter } from "@zip.js/zip.js";

interface Env {
  zip_cache: R2Bucket;
}

interface ZipMetadata {
  files: Array<{
    path: string;
    uncompressedSize: number;
    compressedSize: number;
    lastModified: string;
  }>;
  processedAt: string;
}

const withoutSlashes = (etag: string | null) => {
  if (!etag) {
    return;
  }
  if (etag.startsWith('"') && etag.endsWith('"')) {
    return etag.slice(1, etag.length - 1);
  }
  return etag;
};
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const zipUrl = url.searchParams.get("url");
    if (!zipUrl) {
      return new Response("Invalid request", { status: 400 });
    }

    try {
      const response = await fetch(zipUrl);
      const finalUrl = response.url;
      const etag = withoutSlashes(response.headers.get("etag"));
      const key = etag ? `${finalUrl}/${etag}` : finalUrl;

      // Check cache
      const metadata = await env.zip_cache.get(key);
      if (metadata) {
        const json: ZipMetadata = await metadata.json();
        const existingFiles = await env.zip_cache.list({ prefix: key + "/" });
        return new Response(
          JSON.stringify(
            {
              metadataFiles: json.files.length,
              processedAt: json.processedAt,
              truncated: existingFiles.truncated,
              keys: existingFiles.objects.map((x) => x.key).length,
            },
            undefined,
            2,
          ),
          { status: 200 },
        );
      }

      // Process new ZIP
      const responseStream = response.body;
      if (!responseStream) throw new Error("No response body");

      const blob = await response.blob();
      const zipReader = new ZipReader(new BlobReader(blob));

      const filesMetadata: ZipMetadata = {
        files: [],
        processedAt: new Date().toISOString(),
      };

      // Process entries
      for await (const entry of zipReader.getEntriesGenerator()) {
        if (entry.directory) continue;

        filesMetadata.files.push({
          path: entry.filename,
          uncompressedSize: entry.uncompressedSize,
          compressedSize: entry.compressedSize,
          lastModified: entry.lastModDate.toISOString(),
        });

        const writer = new Uint8ArrayWriter();
        const data = await entry.getData!(writer);

        await env.zip_cache.put(`${key}/${entry.filename}`, data, {
          customMetadata: {
            path: entry.filename,
            "uncompressed-size": entry.uncompressedSize.toString(),
            "compressed-size": entry.compressedSize.toString(),
            "last-modified": entry.lastModDate.toISOString(),
          },
        });

        if (filesMetadata.files.length % 100 === 0) {
          console.log(`Processed ${filesMetadata.files.length} files`);
        }
      }

      await env.zip_cache.put(key, JSON.stringify(filesMetadata));
      await zipReader.close();

      return new Response("Processing complete", { status: 200 });
    } catch (error: any) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  },
};

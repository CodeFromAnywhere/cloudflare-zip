import {
  BlobWriter,
  HttpRangeReader,
  HttpReader,
  ZipReader,
} from "@zip.js/zip.js";

async function readZipSubset(url: string, targetPrefix: string) {
  // Use HttpRangeReader for efficient HTTP fetching
  const reader = new HttpReader(url, {
    useRangeHeader: true,
    forceRangeRequests: true,
    combineSizeEocd: true,
  });

  const zipReader = new ZipReader(reader);
  const targetEntries = [];

  try {
    // Use generator to process entries one at a time
    for await (const entry of zipReader.getEntriesGenerator()) {
      if (entry.filename.startsWith(targetPrefix)) {
        targetEntries.push(entry);
      }
    }

    // Process only the entries we want
    return await Promise.all(
      targetEntries.map(async (entry) => {
        return {
          name: entry.filename,
          data: await entry.getData?.(new BlobWriter()),
        };
      }),
    );
  } finally {
    // Clean up
    await zipReader.close();
  }
}

const test = async () => {
  console.time();
  console.log("starting");
  const results = await readZipSubset(
    "https://codeload.github.com/oven-sh/bun/legacy.zip/refs/heads/main",
    "ci/darwin/scripts/",
  );

  console.log(results);
  console.timeEnd();
};
test();

/*
1. Do a test with a zip in a R2 to see if I can get a single file from there using the range and zip.js
2. Do a test where I quickly get the systemdirectory
3. Do a test to prove I can get multiple subsequent files, and then unpack that in my worker, using a multipart stream (or so)
*/

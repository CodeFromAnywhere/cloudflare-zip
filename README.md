Tried https://gildas-lormeau.github.io/zip.js/ within a cloudflare worker, streaming. It seems to work except for that for large files, e.g. http://localhost:3000/?url=https://github.com/facebook/react/archive/refs/heads/main.zip it will never respond and keep hanging at the end, even though it successfully saves the resulting metadadata in the r2.

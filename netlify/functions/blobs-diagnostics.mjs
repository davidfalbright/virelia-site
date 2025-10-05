export async function handler() {
  const ctx = process.env.NETLIFY_BLOBS_CONTEXT;
  const siteId = process.env.NETLIFY_SITE_ID;
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify({
      siteId,
      blobsContextPresent: Boolean(ctx),
      // uncomment if you want to see the full object:
      // blobsContextRaw: ctx
      node: process.version,
      // quick sanity: the functions runtime provides AWS env vars in Node funcs
      runtime: {
        awsLambdaFn: process.env.AWS_LAMBDA_FUNCTION_NAME || null
      }
    })
  };
}

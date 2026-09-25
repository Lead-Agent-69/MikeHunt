export async function fetchWithCloudflareBypass(url: string): Promise<string> {
  const response = await fetch(process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cmd: 'request.get',
      url: url,
      maxTimeout: 60000,
    }),
  });
  
  const data = await response.json();
  
  if (data.status === 'ok') {
    return data.solution.response; // HTML content
  }
  
  throw new Error(`FlareSolverr failed: ${data.message}`);
}

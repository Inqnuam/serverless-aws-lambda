export async function callLambda(port: number, lambdaName: string, payload?: string) {
  const res = await fetch(`http://localhost:${port}/@invoke/${lambdaName}`, {
    method: "POST",
    body: payload,
  });

  return res.json();
}

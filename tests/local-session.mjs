export async function localSession(base) {
  const response = await fetch(base + "/api/v1/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key:
        process.env.STUDY_TEST_ACCESS_KEY ||
        "local-testing-device-access-not-a-production-secret",
    }),
  });
  if (response.status === 503) return "__sites_local_auth=1";
  if (!response.ok)
    throw new Error("Local test access key does not match .dev.vars");
  return response.headers.get("set-cookie").split(";")[0];
}

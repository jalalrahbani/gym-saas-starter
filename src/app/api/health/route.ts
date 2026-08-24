export async function GET() {
  return Response.json({ ok: true, service: "gym-saas-starter", timestamp: new Date().toISOString() });
}

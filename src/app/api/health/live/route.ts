export async function GET() {
  return Response.json({ status: "ok", service: "jump-in-the-mix", timestamp: new Date().toISOString() });
}

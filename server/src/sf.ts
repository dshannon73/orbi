import 'dotenv/config';
import jsforce from 'jsforce';
import { execSync } from 'child_process';

type SfConnection = InstanceType<typeof jsforce.Connection>;

let _conn: SfConnection | null = null;

/** Fetch a fresh access token from the SF CLI for the org62 alias */
function getTokenFromCli(): { accessToken: string; instanceUrl: string } | null {
  try {
    const raw = execSync('sf org display --target-org org62 --json 2>/dev/null', { encoding: 'utf8' });
    const data = JSON.parse(raw);
    const result = data?.result;
    if (result?.accessToken && result?.instanceUrl) {
      return { accessToken: result.accessToken, instanceUrl: result.instanceUrl };
    }
  } catch { /* fall through */ }
  return null;
}

export function getConnection(): SfConnection {
  // Always fetch a fresh token from the CLI — it handles refresh transparently
  const cli = getTokenFromCli();
  if (cli && (_conn === null || (_conn as any).accessToken !== cli.accessToken)) {
    _conn = new jsforce.Connection({
      instanceUrl: cli.instanceUrl,
      accessToken: cli.accessToken,
      version: '62.0',
    });
  }
  if (!_conn) {
    _conn = new jsforce.Connection({
      instanceUrl: process.env.SF_INSTANCE_URL,
      accessToken: process.env.SF_ACCESS_TOKEN,
      version: '62.0',
    });
  }
  return _conn;
}

/** Replace the active connection — called to force a refresh */
export function resetConnection(): SfConnection {
  _conn = null;
  return getConnection();
}

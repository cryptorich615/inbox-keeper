import {SecretManagerServiceClient} from '@google-cloud/secret-manager';

/** Loads a Secret Manager resource through Workload Identity. Values are never logged. */
export async function accessSecret(resourceName: string, client = new SecretManagerServiceClient()): Promise<string> {
  if (!/^projects\/[^/]+\/secrets\/[^/]+\/versions\/[^/]+$/.test(resourceName)) throw new Error('Invalid Secret Manager version resource');
  const [version] = await client.accessSecretVersion({name: resourceName});
  const value = version.payload?.data?.toString();
  if (!value) throw new Error('Secret Manager returned an empty value');
  return value;
}

// Accès au stockage objet compatible S3 (Cloudflare R2 en production, versitygw en local / CI).
import { AwsClient } from 'aws4fetch';

export interface StorageConfig {
  /** Point d'accès utilisé par la fonction (HEAD, DELETE). */
  endpoint: string;
  /** Point d'accès des URL signées données au navigateur (identique en production). */
  publicEndpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Lit la configuration dans les secrets de la fonction ; null si elle est incomplète. */
export function storageConfigFromEnv(env: (name: string) => string | undefined): StorageConfig | null {
  const endpoint = env('R2_ENDPOINT');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  const bucket = env('R2_BUCKET');
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    publicEndpoint: (env('R2_PUBLIC_ENDPOINT') || endpoint).replace(/\/+$/, ''),
    accessKeyId,
    secretAccessKey,
    bucket,
  };
}

/** Chemin d'un objet (adressage « path-style » : /bucket/clé), chaque segment encodé. */
export function objectPath(bucket: string, key: string): string {
  return `/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** En-tête Content-Disposition d'un téléchargement, nom de fichier accentué compris (RFC 6266). */
export function contentDisposition(
  filename: string | null,
  type: 'inline' | 'attachment' = 'inline',
): string {
  if (!filename) return type;
  // Repli ASCII pour les vieux navigateurs : accents retirés, autres caractères remplacés.
  const ascii = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]|["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export interface ObjectInfo {
  size: number;
  contentType: string | null;
}

export class ObjectStorage {
  readonly bucket: string;
  readonly #client: AwsClient;
  readonly #endpoint: string;
  readonly #publicEndpoint: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    this.#endpoint = config.endpoint;
    this.#publicEndpoint = config.publicEndpoint;
    this.#client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: 'auto',
    });
  }

  /** URL signée à durée limitée. Les en-têtes fournis (ex. Content-Type) sont imposés au navigateur. */
  async presign(
    method: 'GET' | 'PUT',
    bucket: string,
    key: string,
    expiresIn: number,
    options: { headers?: Record<string, string>; query?: Record<string, string> } = {},
  ): Promise<string> {
    const url = new URL(this.#publicEndpoint + objectPath(bucket, key));
    url.searchParams.set('X-Amz-Expires', String(expiresIn));
    for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, value);
    const signed = await this.#client.sign(new Request(url, { method, headers: options.headers }), {
      aws: { signQuery: true, allHeaders: true },
    });
    return signed.url;
  }

  /** Taille et type de l'objet stocké, ou null s'il n'existe pas. */
  async head(bucket: string, key: string): Promise<ObjectInfo | null> {
    const response = await this.#client.fetch(this.#endpoint + objectPath(bucket, key), { method: 'HEAD' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HEAD ${response.status}`);
    return {
      size: Number(response.headers.get('content-length') ?? 0),
      contentType: response.headers.get('content-type'),
    };
  }

  async delete(bucket: string, key: string): Promise<void> {
    const response = await this.#client.fetch(this.#endpoint + objectPath(bucket, key), { method: 'DELETE' });
    if (!response.ok && response.status !== 404) throw new Error(`DELETE ${response.status}`);
  }
}

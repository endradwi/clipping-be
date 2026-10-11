import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../common/logger';
import { AppError } from '../common/errors';

export class StorageService {
  private s3: S3Client | null = null;
  private bucket: string;
  private publicDomain: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET_NAME || 'cheat-clip-media';
    this.publicDomain = (process.env.R2_PUBLIC_DOMAIN || 'https://pub-054cc5f9c9824a97a630013aee308d7e.r2.dev').replace(/\/$/, '');

    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (accountId && accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey
        }
      });
      logger.info('Cloudflare R2 storage client initialized');
    } else {
      logger.warn('Cloudflare R2 credentials incomplete, falling back to local storage simulation');
    }
  }

  // Generate Presigned Upload URL for direct client-to-R2 upload (zero VPS load)
  public async createPresignedUploadUrl(filename: string, contentType: string = 'video/mp4'): Promise<{ presignedUrl: string; publicUrl: string; key: string }> {
    const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `uploads/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${cleanName}`;

    if (!this.s3) {
      logger.warn(`Storage running in mock/test mode: generating local presigned URL`);
      return {
        presignedUrl: `${this.publicDomain}/${key}?mock_presigned=true`,
        publicUrl: `${this.publicDomain}/${key}`,
        key
      };
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType
    });

    const presignedUrl = await getSignedUrl(this.s3 as any, command, { expiresIn: 3600 });
    const publicUrl = `${this.publicDomain}/${key}`;

    logger.info(`Generated presigned upload URL for key=${key}`);
    return { presignedUrl, publicUrl, key };
  }

  // Upload MP4 buffer/file to Cloudflare R2
  public async uploadClip(filePath: string, destinationKey: string): Promise<string> {
    if (!this.s3) {
      logger.warn(`Storage running in local-mode: file kept at ${filePath}`);
      return `file://${filePath}`;
    }

    logger.info(`Uploading clip to Cloudflare R2: bucket=${this.bucket}, key=${destinationKey}`);
    const fileBytes = await Bun.file(filePath).arrayBuffer();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: destinationKey,
      Body: new Uint8Array(fileBytes),
      ContentType: 'video/mp4'
    });

    await this.s3.send(command);
    const publicUrl = `${this.publicDomain}/${destinationKey}`;
    logger.info(`Upload completed. Public R2 URL: ${publicUrl}`);
    return publicUrl;
  }
}

export const storageService = new StorageService();

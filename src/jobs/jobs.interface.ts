import type { File } from '@prisma/client';

/**
 * Payload do job de processamento de arquivo.
 */
export interface FileUploadJobData {
  readonly fileId: File['id'];
  readonly filename: File['filename'];
  readonly queuedAt: Date;
}

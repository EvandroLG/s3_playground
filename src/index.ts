import express from 'express';
import multer from 'multer';
import { config } from 'dotenv';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { readFileSync, unlinkSync } from 'node:fs';

interface MulterRequest extends express.Request {
  file?: Express.Multer.File;
}

interface DeleteRequest extends express.Request {
  params: {
    key: string;
  };
}

config();

const app = express();
const upload = multer({ dest: 'uploads/' });

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const bucketName = process.env.S3_BUCKET_NAME || '';

app.use(express.json());

app.get('/health', (_, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * Handles file uploads to S3 bucket
 *
 * This endpoint receives a file through a multipart form request, uploads it to
 * the configured S3 bucket, and then removes the local temporary file.
 *
 * @route POST /upload
 * @param {file} file - The file to upload (form field 'file')
 *
 * @returns {Object} 200 - Success response with message
 * @returns {Object} 400 - Error response if no file was uploaded
 * @returns {Object} 500 - Error response if S3 upload fails
 */
app.post(
  '/upload',
  upload.single('file'),
  async (req: MulterRequest, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const filePath = req.file.path;
    const fileContent = readFileSync(filePath);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: req.file.originalname,
      Body: fileContent,
    });

    try {
      await s3.send(command);
      unlinkSync(filePath);
      res.json({ message: 'File uploaded successfully' });
    } catch (err) {
      console.error('Error uploading file:', err);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
);

/**
 * Route handler for GET /files
 *
 * Lists all files stored in the S3 bucket and returns them in a simplified format.
 *
 * @route GET /files
 * @returns {Object[]} files - Array of file objects
 * @returns {string} files[].key - S3 object key
 * @returns {Date} files[].lastModified - Last modified date of the file
 * @returns {number} files[].size - Size of the file in bytes
 * @throws {Error} 500 - If there was an error retrieving files from S3
 */
app.get('/files', async (_, res) => {
  const command = new ListObjectsV2Command({
    Bucket: bucketName,
  });

  try {
    const data = await s3.send(command);
    const files =
      data.Contents?.map((file) => ({
        key: file.Key,
        lastModified: file.LastModified,
        size: file.Size,
      })) || [];

    res.json(files);
  } catch (err) {
    console.error('Error retrieving file:', err);
    res.status(500).json({ error: 'Failed to retrieve file' });
  }
});

/**
 * Delete a file from S3 storage
 *
 * @route DELETE /files/:key
 * @param {Object} req - The Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.key - The key (filename) of the file to delete
 * @param {Object} res - The Express response object
 * @returns {Object} JSON response with success message or error
 *
 * @throws {400} - If file key is not provided
 * @throws {500} - If S3 file deletion operation fails
 */
app.delete('/files/:key', async (req: DeleteRequest, res): Promise<void> => {
  const { key } = req.params;

  if (!key) {
    res.status(400).json({ error: 'File key is required' });
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  try {
    await s3.send(command);
    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

import express from 'express';
import multer from 'multer';
import { config } from 'dotenv';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { readFileSync, unlinkSync } from 'node:fs';

interface MulterRequest extends express.Request {
  file?: Express.Multer.File;
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

const bucketName = process.env.AWS_S3_BUCKET_NAME || '';

app.use(express.json());

app.get('/', (_, res) => {
  res.json({ message: 'Hello World!' });
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

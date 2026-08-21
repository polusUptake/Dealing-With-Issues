import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

export function getCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary;
}

getCloudinary();

export interface CloudinaryUploadResult {
  url: string;
  public_id: string;
}

export const uploadImageBuffer = (
  buffer: Buffer,
  folder = process.env.CLOUDINARY_FOLDER || 'disaster_reports'
): Promise<CloudinaryUploadResult> => {
  const client = getCloudinary();
  return new Promise((resolve, reject) => {
    const uploadStream = client.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Cloudinary upload failed'));
        }
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    stream.pipe(uploadStream);
  });
};

export const uploadDataUrl = async (
  dataUrl: string,
  folder = process.env.CLOUDINARY_FOLDER || 'disaster_reports'
): Promise<CloudinaryUploadResult> => {
  const client = getCloudinary();
  const result = await client.uploader.upload(dataUrl, {
    folder,
    resource_type: 'image',
  });
  return {
    url: result.secure_url,
    public_id: result.public_id,
  };
};

export default cloudinary;
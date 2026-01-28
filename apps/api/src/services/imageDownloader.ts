/**
 * Image downloader service with safety limits and local storage
 */

import axios from "axios";
import { createWriteStream, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import sharp from "sharp";
import { config } from "../config";

const REQUEST_TIMEOUT_MS = 10000;
const MAX_IMAGE_WIDTH = 1024;

/**
 * Download and save an image locally
 * Returns the public URL path for the saved image
 */
export async function downloadImage(params: {
  imageUrl: string;
  productId: string;
  index: number;
}): Promise<string> {
  const { imageUrl, productId, index } = params;

  // Validate URL
  if (!imageUrl || (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://"))) {
    throw new Error(`Invalid image URL: ${imageUrl}`);
  }

  // Check content-type and size via HEAD request first
  try {
    const headResponse = await axios.head(imageUrl, {
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 5,
    });

    const contentType = headResponse.headers["content-type"] || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`URL does not point to an image: ${contentType}`);
    }

    const contentLength = headResponse.headers["content-length"];
    if (contentLength && parseInt(contentLength, 10) > config.imageMaxBytes) {
      throw new Error(`Image too large: ${contentLength} bytes`);
    }
  } catch (error) {
    // If HEAD fails, try GET but we'll check content-type in the stream
    if (axios.isAxiosError(error) && error.response?.status === 405) {
      // Method not allowed, continue with GET
    } else {
      throw error;
    }
  }

  // Download image
  const response = await axios.get(imageUrl, {
    responseType: "stream",
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 5,
    maxContentLength: config.imageMaxBytes,
    maxBodyLength: config.imageMaxBytes,
  });

  // Verify content-type
  const contentType = response.headers["content-type"] || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`URL does not point to an image: ${contentType}`);
  }

  // Create directory for product images
  const productDir = join(process.cwd(), config.imageDownloadDir, productId);
  if (!existsSync(productDir)) {
    mkdirSync(productDir, { recursive: true });
  }

  // Save path
  const filename = `${index}.jpg`;
  const filePath = join(productDir, filename);

  // Process image with sharp: resize and convert to JPEG
  const pipeline = sharp()
    .resize(MAX_IMAGE_WIDTH, null, {
      withoutEnlargement: true,
      fit: "inside",
    })
    .jpeg({ quality: 85 });

  // Pipe response stream through sharp to file
  await new Promise<void>((resolve, reject) => {
    response.data
      .pipe(pipeline)
      .pipe(createWriteStream(filePath))
      .on("finish", resolve)
      .on("error", reject);
  });

  // Return public URL path
  return `${config.publicImageBaseUrl}/${productId}/${filename}`;
}


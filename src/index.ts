import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// Configuration Constants
const MAX_WIDTH = 1960;
const MAX_SIZE_IN_BYTES = 500 * 1024; // Max size of 500KB
const IMAGE_QUALITY = 80;
const CONCURRENCY_LIMIT = 5;
const OUTPUT_JSON_FILE = "image_optimization_results.json";
const CLOUDINARY_FOLDER = "french-dandy";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

interface ImageResult {
  original_public_id: string;
  new_public_id: string;
  original_size: number;
  new_size: number;
  size_reduction: number;
    before_format: string;
    after_format: string;
}

async function processImage(resource: any): Promise<ImageResult | null> {
  try {
    const newPublicId = `${resource.public_id}_optimized`;

    // Use Cloudinary's transformation parameters
    const result = await cloudinary.uploader.explicit(resource.public_id, {
      type: "upload",
      eager: [
        {
          width: MAX_WIDTH,
          crop: "limit",
          fetch_format: "auto",
          quality: IMAGE_QUALITY,
        },
      ],
      eager_async: false,
      public_id: newPublicId,
      folder: CLOUDINARY_FOLDER,
    });

    // Get the size of the new image
    const newResource = result.eager[0];
    const originalSize = resource.bytes;
    const newSize = newResource.bytes;

    return {
      original_public_id: resource.public_id,
      new_public_id: newPublicId,
      original_size: originalSize,
      new_size: newSize,
      size_reduction: originalSize - newSize,
      before_format: resource.format,
      after_format: newResource.format,
    };
  } catch (error) {
    console.error(`Error processing image ${resource.public_id}:`, error);
    return null;
  }
}

async function getAllResources(): Promise<any[]> {
  let resources: any[] = [];
  let nextCursor: string | undefined = undefined;

  do {
    const result = await cloudinary.api.resources({
      resource_type: "image",
      type: "upload",
      prefix: CLOUDINARY_FOLDER,
      max_results: 500,
      next_cursor: nextCursor,
    });
    resources = resources.concat(result.resources);
    nextCursor = result.next_cursor;
  } while (nextCursor);

  return resources;
}

async function optimizeImages() {
  try {
    let resources = await getAllResources();
    const results: ImageResult[] = [];

    const concurrency = CONCURRENCY_LIMIT;
    const chunks: any[][] = [];

    for (let i = 0; i < resources.length; i += concurrency) {
      chunks.push(resources.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map((resource) => processImage(resource));
      const chunkResults = await Promise.all(promises);
      // Filter out null results in case of errors
      results.push(
        ...chunkResults.filter(
          (result): result is ImageResult => result !== null
        )
      );
    }

    // Save results to JSON file
    fs.writeFileSync(OUTPUT_JSON_FILE, JSON.stringify(results, null, 2));
    console.log(`Optimization results saved to ${OUTPUT_JSON_FILE}`);
  } catch (error) {
    console.error("Error optimizing images:", error);
  }
}

optimizeImages();

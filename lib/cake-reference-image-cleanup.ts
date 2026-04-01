import "server-only";

import {
  CAKE_REFERENCE_IMAGES_BUCKET,
  getCakeReferenceImageCleanupCutoff,
} from "@/lib/cake-reference-images";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const STORAGE_LIST_PAGE_SIZE = 1000;
const STORAGE_DELETE_BATCH_SIZE = 100;
const DB_LOOKUP_BATCH_SIZE = 200;
const ROOT_STORAGE_PATH = "cake-requests";

type StorageListItem = {
  name: string;
  id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CakeReferenceImageStorageObject = {
  path: string;
  createdAt: string;
};

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function isFolderEntry(item: StorageListItem) {
  return !item.id;
}

function getStorageTimestamp(item: StorageListItem) {
  return item.created_at ?? item.updated_at ?? null;
}

function isOlderThanCutoff(item: StorageListItem, cutoff: Date) {
  const timestamp = getStorageTimestamp(item);
  if (!timestamp) {
    return false;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed <= cutoff;
}

async function listStorageDirectory(path: string) {
  const supabase = getSupabaseServerClient();
  const entries: StorageListItem[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(CAKE_REFERENCE_IMAGES_BUCKET)
      .list(path, {
        limit: STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) {
      throw new Error(`Failed to list storage path "${path}": ${error.message}`);
    }

    const page = (data ?? []) as StorageListItem[];
    entries.push(...page);

    if (page.length < STORAGE_LIST_PAGE_SIZE) {
      break;
    }

    offset += page.length;
  }

  return entries;
}

async function listOldStorageObjects(cutoff: Date) {
  const rootEntries = await listStorageDirectory(ROOT_STORAGE_PATH);
  const objects: CakeReferenceImageStorageObject[] = [];

  for (const entry of rootEntries) {
    if (isFolderEntry(entry)) {
      const folderPath = `${ROOT_STORAGE_PATH}/${entry.name}`;
      const nestedEntries = await listStorageDirectory(folderPath);

      for (const nestedEntry of nestedEntries) {
        if (isFolderEntry(nestedEntry) || !isOlderThanCutoff(nestedEntry, cutoff)) {
          continue;
        }

        const timestamp = getStorageTimestamp(nestedEntry);
        if (!timestamp) {
          continue;
        }

        objects.push({
          path: `${folderPath}/${nestedEntry.name}`,
          createdAt: timestamp,
        });
      }

      continue;
    }

    if (!isOlderThanCutoff(entry, cutoff)) {
      continue;
    }

    const timestamp = getStorageTimestamp(entry);
    if (!timestamp) {
      continue;
    }

    objects.push({
      path: `${ROOT_STORAGE_PATH}/${entry.name}`,
      createdAt: timestamp,
    });
  }

  return objects;
}

async function findExistingReferenceImagePaths(paths: string[]) {
  const supabase = getSupabaseServerClient();
  const existingPaths = new Set<string>();

  for (const chunk of chunkArray(paths, DB_LOOKUP_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("cake_custom_requests")
      .select("reference_image_path")
      .in("reference_image_path", chunk);

    if (error) {
      throw new Error(`Failed to query stored cake reference images: ${error.message}`);
    }

    for (const row of data ?? []) {
      const referenceImagePath = row.reference_image_path;
      if (typeof referenceImagePath === "string" && referenceImagePath.length > 0) {
        existingPaths.add(referenceImagePath);
      }
    }
  }

  return existingPaths;
}

async function deleteStoragePaths(paths: string[]) {
  const supabase = getSupabaseServerClient();
  let deletedCount = 0;

  for (const chunk of chunkArray(paths, STORAGE_DELETE_BATCH_SIZE)) {
    const { error } = await supabase.storage
      .from(CAKE_REFERENCE_IMAGES_BUCKET)
      .remove(chunk);

    if (error) {
      throw new Error(`Failed to delete orphaned cake reference images: ${error.message}`);
    }

    deletedCount += chunk.length;
  }

  return deletedCount;
}

export async function findOrphanedCakeReferenceImages(referenceDate = new Date()) {
  const cutoff = getCakeReferenceImageCleanupCutoff(referenceDate);
  const storageObjects = await listOldStorageObjects(cutoff);
  const existingPaths = await findExistingReferenceImagePaths(storageObjects.map((item) => item.path));
  const orphanedObjects = storageObjects.filter((item) => !existingPaths.has(item.path));

  return {
    cutoff,
    scannedCount: storageObjects.length,
    orphanedObjects,
  };
}

export async function cleanupOrphanedCakeReferenceImages(referenceDate = new Date()) {
  const { cutoff, scannedCount, orphanedObjects } = await findOrphanedCakeReferenceImages(referenceDate);
  const deletedCount = await deleteStoragePaths(orphanedObjects.map((item) => item.path));

  return {
    cutoff,
    scannedCount,
    orphanedCount: orphanedObjects.length,
    deletedCount,
    deletedPaths: orphanedObjects.map((item) => item.path),
  };
}

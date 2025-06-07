"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getMoodById, MOODS } from "@/app/lib/moods";
import { getPixabayImage } from "./public";
import aj from "@/lib/arcjet";
import { request } from "@arcjet/next";

export async function createJournalEntry(data) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const req = await request();

    const decision = await aj.protect(req, {
      userId,
      requested: 1,
    });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        const { remaining, reset } = decision.reason;
        console.error({
          code: "RATE_LIMIT_EXCEEDED",
          details: { remaining, resetInSeconds: reset },
        });
        throw new Error("Too many requests. Please try again later.");
      }
      throw new Error("Request blocked");
    }

    // Get user
    const users = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      userId
    );
    if (users.length === 0) throw new Error("User not found");
    const user = users[0];

    // Validate mood
    const mood = MOODS[data.mood.toUpperCase()];
    if (!mood) throw new Error("Invalid mood");

    const moodImageUrl = await getPixabayImage(data.moodQuery);

    // Create entry
    const now = new Date();
    const res = await db.$executeRawUnsafe(
      `INSERT INTO Entry (title, content, mood, moodScore, moodImageUrl, userId, collectionId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.title,
      data.content,
      mood.id,
      mood.score,
      moodImageUrl,
      user.id,
      data.collectionId || null,
      now,
      now
    );

    // Get the created entry back (assuming auto-increment ID, get last inserted)
    const entries = await db.$queryRawUnsafe(
      `SELECT * FROM Entry WHERE userId = ? ORDER BY createdAt DESC LIMIT 1`,
      user.id
    );
    const entry = entries[0];

    // Delete drafts
    await db.$executeRawUnsafe(`DELETE FROM Draft WHERE userId = ?`, user.id);

    revalidatePath("/dashboard");
    return entry;
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function getJournalEntries({
  collectionId,
  orderBy = "desc",
} = {}) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const users = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      userId
    );
    if (users.length === 0) throw new Error("User not found");
    const user = users[0];

    let whereClause = "e.userId = ?";
    const params = [user.id];

    if (collectionId === "unorganized") {
      whereClause += " AND e.collectionId IS NULL";
    } else if (collectionId) {
      whereClause += " AND e.collectionId = ?";
      params.push(collectionId);
    }

    const entries = await db.$queryRawUnsafe(
      `SELECT e.*, c.id AS collectionId, c.name AS collectionName
       FROM Entry e
       LEFT JOIN Collection c ON e.collectionId = c.id
       WHERE ${whereClause}
       ORDER BY e.createdAt ${orderBy.toUpperCase()}`,
      ...params
    );

    const entriesWithMoodData = entries.map((entry) => ({
      ...entry,
      collection: entry.collectionId
        ? { id: entry.collectionId, name: entry.collectionName }
        : null,
      moodData: getMoodById(entry.mood),
    }));

    return {
      success: true,
      data: { entries: entriesWithMoodData },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
export async function getJournalEntry(id) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const users = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      userId
    );
    if (users.length === 0) throw new Error("User not found");
    const user = users[0];

    const entries = await db.$queryRawUnsafe(
      `SELECT e.*, c.id AS collectionId, c.name AS collectionName
       FROM Entry e
       LEFT JOIN Collection c ON e.collectionId = c.id
       WHERE e.id = ? AND e.userId = ? LIMIT 1`,
      id,
      user.id
    );

    if (entries.length === 0) throw new Error("Entry not found");

    const entry = entries[0];
    entry.collection = entry.collectionId
      ? { id: entry.collectionId, name: entry.collectionName }
      : null;

    return entry;
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function deleteJournalEntry(id) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const users = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      userId
    );
    if (users.length === 0) throw new Error("User not found");
    const user = users[0];

    const entries = await db.$queryRawUnsafe(
      `SELECT * FROM Entry WHERE id = ? AND userId = ? LIMIT 1`,
      id,
      user.id
    );

    if (entries.length === 0) throw new Error("Entry not found");

    await db.$executeRawUnsafe(`DELETE FROM Entry WHERE id = ?`, id);

    revalidatePath("/dashboard");
    return entries[0];
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function updateJournalEntry(data) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const users = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      userId
    );
    if (users.length === 0) throw new Error("User not found");
    const user = users[0];

    const entries = await db.$queryRawUnsafe(
      `SELECT * FROM Entry WHERE id = ? AND userId = ? LIMIT 1`,
      data.id,
      user.id
    );

    if (entries.length === 0) throw new Error("Entry not found");
    const existingEntry = entries[0];

    const mood = MOODS[data.mood.toUpperCase()];
    if (!mood) throw new Error("Invalid mood");

    let moodImageUrl = existingEntry.moodImageUrl;
    if (existingEntry.mood !== mood.id) {
      moodImageUrl = await getPixabayImage(data.moodQuery);
    }

    const now = new Date();
    await db.$executeRawUnsafe(
      `UPDATE Entry SET title = ?, content = ?, mood = ?, moodScore = ?, moodImageUrl = ?, collectionId = ?, updatedAt = ?
       WHERE id = ?`,
      data.title,
      data.content,
      mood.id,
      mood.score,
      moodImageUrl,
      data.collectionId || null,
      now,
      data.id
    );

    // Return updated entry
    const updatedEntries = await db.$queryRawUnsafe(
      `SELECT * FROM Entry WHERE id = ? LIMIT 1`,
      data.id
    );

    revalidatePath("/dashboard");
    revalidatePath(`/journal/${data.id}`);

    return updatedEntries[0];
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function getDraft() {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const users = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      userId
    );
    if (users.length === 0) throw new Error("User not found");
    const user = users[0];

    const drafts = await db.$queryRawUnsafe(
      `SELECT * FROM Draft WHERE userId = ? LIMIT 1`,
      user.id
    );

    return { success: true, data: drafts[0] || null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function saveDraft(data) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const users = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      userId
    );
    if (users.length === 0) throw new Error("User not found");
    const user = users[0];

    // Upsert draft: Try update, else insert
    const updated = await db.$executeRawUnsafe(
      `UPDATE Draft SET title = ?, content = ?, mood = ? WHERE userId = ?`,
      data.title,
      data.content,
      data.mood,
      user.id
    );

    if (updated === 0) {
      // No rows updated, insert instead
      await db.$executeRawUnsafe(
        `INSERT INTO Draft (title, content, mood, userId) VALUES (?, ?, ?, ?)`,
        data.title,
        data.content,
        data.mood,
        user.id
      );
    }

    revalidatePath("/dashboard");

    const drafts = await db.$queryRawUnsafe(
      `SELECT * FROM Draft WHERE userId = ? LIMIT 1`,
      user.id
    );

    return { success: true, data: drafts[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

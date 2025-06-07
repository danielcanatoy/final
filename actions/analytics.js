"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";

export async function getAnalytics(period = "30d") {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  try {
    // 1. Get user via raw SQL
    const users = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      userId
    );
    if (users.length === 0) throw new Error("User not found");
    const user = users[0];

    // 2. Calculate start date
    const startDate = new Date();
    const days = period === "7d" ? 7 : period === "15d" ? 15 : 30;
    startDate.setDate(startDate.getDate() - days);

    // 3. Get entries via raw SQL
    const entries = await db.$queryRawUnsafe(
      `SELECT * FROM Entry WHERE userId = ? AND createdAt >= ? ORDER BY createdAt ASC`,
      user.id,
      startDate
    );

    // 4. Process entries
    const moodData = entries.reduce((acc, entry) => {
      const date = new Date(entry.createdAt).toISOString().split("T")[0];
      if (!acc[date]) {
        acc[date] = { totalScore: 0, count: 0, entries: [] };
      }
      acc[date].totalScore += entry.moodScore;
      acc[date].count += 1;
      acc[date].entries.push(entry);
      return acc;
    }, {});

    const analyticsData = Object.entries(moodData).map(([date, data]) => ({
      date,
      averageScore: Number((data.totalScore / data.count).toFixed(1)),
      entryCount: data.count,
    }));

    const totalEntries = entries.length;
    const averageScore = totalEntries
      ? Number(
          (
            entries.reduce((sum, e) => sum + e.moodScore, 0) / totalEntries
          ).toFixed(1)
        )
      : 0;

    const moodCount = {};
    for (const entry of entries) {
      moodCount[entry.mood] = (moodCount[entry.mood] || 0) + 1;
    }

    const mostFrequentMood = Object.entries(moodCount).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];

    const dailyAverage = Number((totalEntries / days).toFixed(1));

    const overallStats = {
      totalEntries,
      averageScore,
      mostFrequentMood,
      dailyAverage,
    };

    return {
      success: true,
      data: {
        timeline: analyticsData,
        stats: overallStats,
        entries,
      },
    };
  } catch (err) {
    console.error("Error generating analytics:", err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

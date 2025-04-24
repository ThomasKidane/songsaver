// src/app/api/getReplayData/route.ts
import { NextRequest, NextResponse } from 'next/server'; // Use NextRequest for App Router [6]
import { Chunk } from '@/components/RankedChunksList'; // Import shared Chunk type

// Define expected structure from the scraper service
interface HeatmapSegment {
  startMillis: number;
  durationMillis: number;
  intensityScoreNormalized: number;
}

// Type the request parameter as NextRequest [6]
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');

  if (!videoId) {
    return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
  }

  try {
    // --- Replace with actual API call ---
    // const response = await fetch(`https://your-chosen-scraper-api.com?videoId=${videoId}`);
    // const data: { heatSeek?: HeatmapSegment[] } = await response.json(); // Type the expected response
    // const heatSeekData: HeatmapSegment[] = data.heatSeek || [];
    // --- MOCK DATA ---
      const heatSeekData: HeatmapSegment[] = [
           { startMillis: 30000, durationMillis: 10000, intensityScoreNormalized: 0.8 },
           { startMillis: 90000, durationMillis: 15000, intensityScoreNormalized: 1.0 },
           { startMillis: 120000, durationMillis: 5000, intensityScoreNormalized: 0.5 },
           { startMillis: 45000, durationMillis: 8000, intensityScoreNormalized: 0.9 },
           { startMillis: 180000, durationMillis: 20000, intensityScoreNormalized: 0.7 }
         ];
    // --- END MOCK DATA ---

    // Type the segment parameter in map and filter
    const processedChunks: Chunk[] = heatSeekData
      .map((segment: HeatmapSegment) => ({
        startSeconds: segment.startMillis / 1000,
        endSeconds: (segment.startMillis + segment.durationMillis) / 1000,
        durationSeconds: segment.durationMillis / 1000,
        intensity: segment.intensityScoreNormalized,
      }))
      .filter((chunk: Chunk) => chunk.durationSeconds >= 5 && chunk.durationSeconds <= 20) // Adjust range as needed
      .sort((a: Chunk, b: Chunk) => b.intensity - a.intensity);

    // Type the response payload
    return NextResponse.json<{ chunks: Chunk[] }>({ chunks: processedChunks });

  } catch (error: unknown) { // Catch unknown type
    console.error('Error fetching replay data:', error);
    // Provide a typed error response
    return NextResponse.json<{ error: string }>(
        { error: error instanceof Error ? error.message : 'Failed to fetch replay data' },
        { status: 500 }
    );
  }
}

// src/app/api/getYoutubeData/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SongSection } from '@/types'; // Adjust path if needed

// --- Interfaces --- (Ensure these match YouTube API V3 response)
interface YoutubeThumbnail { url: string; width?: number; height?: number; }
interface YoutubeThumbnails { default: YoutubeThumbnail; medium?: YoutubeThumbnail; high?: YoutubeThumbnail; }
interface YoutubeVideoSnippet { title: string; thumbnails: YoutubeThumbnails; }
interface YoutubeContentDetails { duration: string; } // Duration in ISO 8601 format
interface YoutubeVideoItem { id: string; snippet: YoutubeVideoSnippet; contentDetails: YoutubeContentDetails; }
interface YoutubeApiResponse { items: YoutubeVideoItem[]; }
interface HeatmapMarker { startMillis: number; intensityScoreNormalized: number; } // From your operational API
interface OperationalApiMostReplayed { markers: HeatmapMarker[]; }
interface OperationalApiVideoData { title?: string; videoId: string; mostReplayed?: OperationalApiMostReplayed; }
interface OperationalApiResponse { items: OperationalApiVideoData[]; }


// --- Helper Function to Parse ISO 8601 Duration ---
function parseISO8601Duration(duration: string): number | null {
  if (!duration) return null;
  // Regex to capture H, M, S components from ISO 8601 duration (e.g., PT1H2M3.45S)
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/;
  const matches = duration.match(regex);
  if (!matches) return null;
  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseFloat(matches[3] || '0');
  const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
  // Return null if duration is zero or somehow negative (though unlikely)
  return totalSeconds > 0 ? totalSeconds : null;
}

// --- findSuggestedChunks Function (Keep your existing implementation) ---
// Ensure it can accept `videoDurationSeconds` which might be null
function findSuggestedChunks(
    markers: HeatmapMarker[],
    videoDurationSeconds: number | null,
): Omit<SongSection, 'id' | 'name'>[] {
    // Your existing logic here...
    const suggestions: Omit<SongSection, 'id' | 'name'>[] = [];
    // ...your calculation logic...
    return suggestions;
}


// --- Main API Route Handler ---
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  const apiKey = process.env.YOUTUBE_API_KEY;
  const operationalApiBaseUrl = process.env.NEXT_PUBLIC_OPERATIONAL_API_URL;

  // Basic Validation
  if (!videoId) { return NextResponse.json({ error: 'Video ID required' }, { status: 400 }); }
  if (!apiKey) { console.error("Missing YT API Key"); return NextResponse.json({ error: 'Server config error (YT API Key)' }, { status: 500 }); }
  // Operational API URL check is optional if suggestions are secondary
  // if (!operationalApiBaseUrl) { console.error('Missing OP API URL'); return NextResponse.json({ error: 'Server config error (OP API)' }, { status: 500 }); }

  let title: string = '';
  let thumbnailUrl: string = '';
  let videoDurationSeconds: number | null = null; // Initialize as null
  let suggestedChunks: Omit<SongSection, 'id' | 'name'>[] = [];
  let operationalApiWarning: string | null = null;

  try {
    // 1. Fetch Official YT Data (Title, Thumb, Duration)
    // Ensure 'contentDetails' is requested in the 'part' parameter
    const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet,contentDetails`;
    console.log(`[API] Fetching YT: ${youtubeApiUrl}`);
    const ytApiResponse = await fetch(youtubeApiUrl);
    let ytApiData: YoutubeApiResponse | null = null;

    if (!ytApiResponse.ok) {
      operationalApiWarning = `YouTube API error ${ytApiResponse.status}; Title/Duration likely unavailable.`;
      console.warn(`[API] YT fetch failed: ${ytApiResponse.status}`);
    } else {
        ytApiData = await ytApiResponse.json();
        if (!ytApiData || !ytApiData.items || ytApiData.items.length === 0) {
            operationalApiWarning = `Video not found via YouTube API.`;
            console.warn(`[API] Video not found (YT): ${videoId}`);
        } else {
            const item = ytApiData.items[0];
            title = item.snippet?.title || 'Title Unknown';
            thumbnailUrl = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '';
            if (item.contentDetails?.duration) {
                videoDurationSeconds = parseISO8601Duration(item.contentDetails.duration);
                if (!videoDurationSeconds) {
                     console.warn("[API] Failed to parse valid duration from YT API.");
                     operationalApiWarning = (operationalApiWarning ? operationalApiWarning + " " : "") + "Video duration unknown; timeline unavailable.";
                } else {
                    console.log(`[API] Parsed Duration: ${videoDurationSeconds}s`);
                }
            } else {
                 console.warn("[API] No duration found in YT API response.");
                 operationalApiWarning = (operationalApiWarning ? operationalApiWarning + " " : "") + "Video duration unavailable.";
            }
        }
    }

    // 2. Fetch Heatmap from Operational API (Optional, based on your setup)
    if (operationalApiBaseUrl) {
      const operationalApiUrl = `${operationalApiBaseUrl.replace(/\/$/, '')}/videos?part=mostReplayed&id=${videoId}`;
      console.log(`[API] Fetching OP: ${operationalApiUrl}`);
      try {
          const operationalResponse = await fetch(operationalApiUrl, { cache: 'no-store' });
          if (!operationalResponse.ok) {
              operationalApiWarning = (operationalApiWarning ? operationalApiWarning + " " : "") + `OP API error ${operationalResponse.status}.`;
          } else {
              // Clean and parse OP response
              const responseText = await operationalResponse.text();
              const jsonStartIndex = responseText.indexOf('{');
              if (jsonStartIndex !== -1) {
                  const jsonString = responseText.substring(jsonStartIndex);
                  try {
                      const operationalData: OperationalApiResponse = JSON.parse(jsonString);
                      // Get title from OP if YT failed
                      if (!title && operationalData.items?.[0]?.title) {
                          title = operationalData.items[0].title;
                      }
                      // Get suggestions
                      if (operationalData.items?.[0]?.mostReplayed?.markers) {
                          suggestedChunks = findSuggestedChunks(operationalData.items[0].mostReplayed.markers, videoDurationSeconds);
                      }
                  } catch (e) { /* Handle JSON parse error */ }
              }
          }
      } catch (opError) { /* Handle fetch error */ }
    }

     // Final check for essential data (at least title)
     if (!title) {
        return NextResponse.json({ error: 'Could not determine video title' }, { status: 500 });
     }

    // 3. Return Data including duration
    return NextResponse.json({
        title,
        thumbnailUrl,
        suggestedChunks,
        operationalApiWarning,
        durationSeconds: videoDurationSeconds // *** RETURN DURATION ***
    });

  } catch (error) {
    console.error(`[API] General error:`, error);
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 });
  }
}

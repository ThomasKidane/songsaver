// src/app/api/getYoutubeData/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SongSection } from '@/types';

// --- Interfaces ---
// YouTube V3 API
interface YoutubeThumbnail { url: string; width?: number; height?: number; }
interface YoutubeThumbnails { default: YoutubeThumbnail; medium?: YoutubeThumbnail; high?: YoutubeThumbnail; }
interface YoutubeVideoSnippet { title: string; thumbnails: YoutubeThumbnails; }
interface YoutubeContentDetails { duration: string; } // Duration in ISO 8601 format
interface YoutubeVideoItem { id: string; snippet: YoutubeVideoSnippet; contentDetails: YoutubeContentDetails; }
interface YoutubeApiResponse { items: YoutubeVideoItem[]; }
// Self-hosted API
interface HeatmapMarker { startMillis: number; intensityScoreNormalized: number; }
interface OperationalApiMostReplayed { markers: HeatmapMarker[]; }
interface OperationalApiVideoData { title?: string; videoId: string; mostReplayed?: OperationalApiMostReplayed; }
interface OperationalApiResponse { items: OperationalApiVideoData[]; }

// --- Helper Function to Parse ISO 8601 Duration ---
function parseISO8601Duration(duration: string): number {
  if (!duration) return 0;
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/;
  const matches = duration.match(regex);
  if (!matches) return 0;
  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseFloat(matches[3] || '0');
  return (hours * 3600) + (minutes * 60) + seconds;
}

// --- REVISED findSuggestedChunks Function (Lower Threshold + Time Weighting) ---
function findSuggestedChunks(
    markers: HeatmapMarker[],
    videoDurationSeconds: number | null, // Pass video duration
    minDurationSec = 3,        // *** Lower min duration ***
    maxDurationSec = 18,       // Slightly adjusted max duration
    intensityThreshold = 0.20, // *** Lower intensity threshold ***
    timeWeightFactor = 0.4     // How much to boost later chunks (0 to 1+)
): Omit<SongSection, 'id' | 'name'>[] {

    if (!markers || markers.length < 2) return [];

    // Ensure markers are sorted and remove the initial potentially misleading marker at time 0
    const sortedMarkers = markers
        .filter(m => m.startMillis > 500) // *** Ignore first 500ms ***
        .sort((a, b) => a.startMillis - b.startMillis);

    if (sortedMarkers.length < 2) return []; // Still need points after removing the first

    const candidateChunks: (Omit<SongSection, 'id' | 'name'> & { peakIntensity: number; weightedScore: number })[] = [];
    let i = 0;
    const videoDurationMillis = videoDurationSeconds ? videoDurationSeconds * 1000 : null;

    // Find all potential candidate segments
    while (i < sortedMarkers.length - 1) {
        // Look for start of a segment meeting the lower threshold
        if (sortedMarkers[i].intensityScoreNormalized >= intensityThreshold) {
            const chunkStartTimeMillis = sortedMarkers[i].startMillis;
            let currentPeakIntensity = sortedMarkers[i].intensityScoreNormalized; // Track peak within this segment
            let chunkEndTimeMillis = -1;
            let j = i + 1;

            // Find where intensity drops below threshold or end of markers
            while (j < sortedMarkers.length) {
                currentPeakIntensity = Math.max(currentPeakIntensity, sortedMarkers[j].intensityScoreNormalized);
                if (sortedMarkers[j].intensityScoreNormalized < intensityThreshold) {
                    chunkEndTimeMillis = sortedMarkers[j].startMillis;
                    break;
                }
                j++;
            }
            // If intensity never dropped, end is start of last marker
            if (chunkEndTimeMillis === -1 && j === sortedMarkers.length) {
                 chunkEndTimeMillis = sortedMarkers[sortedMarkers.length - 1].startMillis;
            }

            // Process if a valid segment end was found
            if (chunkEndTimeMillis !== -1 && chunkEndTimeMillis > chunkStartTimeMillis) {
                let durationSec = (chunkEndTimeMillis - chunkStartTimeMillis) / 1000;

                // Check minimum duration
                if (durationSec >= minDurationSec) {
                     // Cap the end time by max duration or video end
                     let cappedEndTimeMillis = chunkEndTimeMillis;
                     if (durationSec > maxDurationSec) {
                        cappedEndTimeMillis = chunkStartTimeMillis + maxDurationSec * 1000;
                     }
                     if (videoDurationMillis && cappedEndTimeMillis > videoDurationMillis) {
                         cappedEndTimeMillis = videoDurationMillis;
                     }
                     // Recalculate duration after capping
                     durationSec = (cappedEndTimeMillis - chunkStartTimeMillis) / 1000;

                     // Add if duration still valid after capping
                     if (durationSec >= minDurationSec) {
                         // Calculate time weight (0 for start, ~1 for end)
                         const timeProgress = videoDurationMillis ? (chunkStartTimeMillis / videoDurationMillis) : 0.5;
                         // Calculate weighted score = peakIntensity * (1 + boost)
                         const weightedScore = currentPeakIntensity * (1 + (timeProgress * timeWeightFactor));

                         candidateChunks.push({
                             startSeconds: chunkStartTimeMillis / 1000,
                             endSeconds: cappedEndTimeMillis / 1000,
                             peakIntensity: currentPeakIntensity,
                             weightedScore: weightedScore
                         });
                     }
                     // Move index past the processed segment
                     i = j -1; // Re-check marker where intensity dropped
                } else {
                     i++; // Chunk too short
                }
            } else {
                i++; // Didn't find valid end
            }
        } else {
            i++; // Below threshold
        }
    }

    // Calculate desired number of suggestions based on duration
    let numSuggestions = 3; // Min 3 suggestions
    if (videoDurationSeconds) {
        // Approx 2-3 per minute, capped at 7
        numSuggestions = Math.max(3, Math.min(7, Math.ceil(videoDurationSeconds / 60) * 2));
    }
    console.log(`[findSuggestedChunks] Aiming for ${numSuggestions} suggestions.`);

    // Sort all valid candidates by the calculated weighted score (descending)
    return candidateChunks
        .sort((a, b) => b.weightedScore - a.weightedScore)
        .slice(0, numSuggestions) // Take the top N
        .map(({ ...rest }) => rest); // Return only start/end seconds
}


// --- Main API Route Handler (With Text Cleaning Workaround) ---
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  const apiKey = process.env.YOUTUBE_API_KEY;
  const operationalApiBaseUrl = process.env.NEXT_PUBLIC_OPERATIONAL_API_URL;

  // --- Validation ---
  if (!videoId) { return NextResponse.json({ error: 'Video ID required' }, { status: 400 }); }
  if (!operationalApiBaseUrl) { console.error('Self-hosted API URL missing (NEXT_PUBLIC_OPERATIONAL_API_URL)'); return NextResponse.json({ error: 'Server config error: Missing operational API URL' }, { status: 500 }); }
  if (!apiKey) { console.warn('YouTube API Key missing (YOUTUBE_API_KEY), fallback may fail.'); }

  let title = '';
  let thumbnailUrl = '';
  let videoDurationSeconds: number | null = null; // Store duration
  let suggestedChunks: Omit<SongSection, 'id' | 'name'>[] = [];
  let operationalApiWarning: string | null = null;

  try {
    // 1. Fetch Title/Thumb/Duration from Official YouTube API
    if (apiKey) {
      const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet,contentDetails`;
      console.log(`[API Route] Fetching snippet & details from YouTube API: ${youtubeApiUrl}`);
      const ytApiResponse = await fetch(youtubeApiUrl);
      if (ytApiResponse.ok) {
           const ytApiData: YoutubeApiResponse = await ytApiResponse.json();
           if (ytApiData.items && ytApiData.items.length > 0) {
               const item = ytApiData.items[0];
               title = item.snippet.title;
               thumbnailUrl = item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url || '';
               videoDurationSeconds = parseISO8601Duration(item.contentDetails.duration);
               console.log(`[API Route] Video duration: ${videoDurationSeconds} seconds`);
           } else {
               console.warn(`[API Route] Video not found via YouTube API (ID: ${videoId})`);
               return NextResponse.json({ error: 'Video not found' }, { status: 404 }); // Stop if official API says not found
           }
      } else {
          console.warn(`[API Route] YouTube API fetch failed: ${ytApiResponse.status}`);
          // Proceed, but title/thumb/duration might be missing
      }
    } else {
         console.warn("[API Route] No YouTube API Key, cannot fetch title/thumbnail/duration.");
         // Need title at minimum. If operational API doesn't provide it, we have to fail.
    }

    // 2. Fetch Heatmap from Self-Hosted Instance
    // Only proceed if operational URL is set (validation passed earlier)
    const operationalApiUrl = `${operationalApiBaseUrl.replace(/\/$/, '')}/videos?part=mostReplayed&id=${videoId}`;
    console.log(`[API Route] Attempting fetch from self-hosted: ${operationalApiUrl}`);
    const operationalResponse = await fetch(operationalApiUrl, { cache: 'no-store' });
    console.log(`[API Route] Self-hosted status: ${operationalResponse.status}`);

    if (!operationalResponse.ok) {
      operationalApiWarning = `Self-hosted API responded with status: ${operationalResponse.status}`;
      console.warn(`[API Route] ${operationalApiWarning}`);
    } else {
        // WORKAROUND: Fetch as text and clean potential PHP warnings
        try {
            const responseText = await operationalResponse.text();
            const jsonStartIndex = responseText.indexOf('{');

            if (jsonStartIndex === -1) {
                operationalApiWarning = `Valid JSON start '{' not found in self-hosted response.`;
                console.warn(`[API Route] ${operationalApiWarning}`);
                // console.warn("[API Route] Raw response text:", responseText.substring(0, 500)); // Uncomment for debugging
            } else {
                const jsonString = responseText.substring(jsonStartIndex);
                try {
                    const operationalData: OperationalApiResponse = JSON.parse(jsonString);
                    if (jsonStartIndex > 0) { operationalApiWarning = "Self-hosted API produced warnings."; console.warn(`[API Route] ${operationalApiWarning}`); }

                    if (operationalData.items && operationalData.items.length > 0) {
                        const videoData = operationalData.items[0];
                        // Use operational title ONLY if official one is missing
                        if (!title && videoData.title) { title = videoData.title; }
                        // Process markers if they exist
                        if (videoData.mostReplayed?.markers) {
                            // *** Pass videoDurationSeconds to the function ***
                            suggestedChunks = findSuggestedChunks(videoData.mostReplayed.markers, videoDurationSeconds);
                            console.log(`[API Route] Found ${suggestedChunks.length} REAL suggested chunks after cleaning`);
                        } else { console.log(`[API Route] No mostReplayed.markers data in cleaned JSON`); }
                    } else { console.log(`[API Route] No items in cleaned JSON`); }

                } catch (jsonParseError: unknown) {
                    operationalApiWarning = `Failed to parse JSON from self-hosted API after cleaning. Error: ${jsonParseError instanceof Error ? jsonParseError.message : String(jsonParseError)}`;
                    console.error(`[API Route] ${operationalApiWarning}`);
                    // console.error("[API Route] Text attempted to parse:", jsonString.substring(0, 500)); // Uncomment for debugging
                }
            }
        } catch (textError: unknown) {
             operationalApiWarning = `Failed to read response text from self-hosted API. Error: ${textError instanceof Error ? textError.message : String(textError)}`;
             console.error(`[API Route] ${operationalApiWarning}`);
        }
        // END WORKAROUND
    }

    // Final check - MUST have title
    if (!title) {
       console.error("[API Route] Failed to retrieve title from any source.");
       // Use operationalApiWarning if it exists, otherwise generic message
       return NextResponse.json({ error: operationalApiWarning || 'Could not retrieve video title' }, { status: 404 });
    }

    //3. Return the data.

    console.log(`[API Route] Returning: Title=${!!title}, Thumb=${!!thumbnailUrl}, Chunks=${suggestedChunks.length}, Duration=${videoDurationSeconds}, Warn=${!!operationalApiWarning}`);
    return NextResponse.json({
        title,
        thumbnailUrl,
        suggestedChunks, // Suggestions generated by API (paste-5 logic)
        durationSeconds: videoDurationSeconds, // <<< ADD DURATION HERE
        operationalApiWarning
     });


  } catch (error: unknown) {
    // Catch network errors from fetch itself
    console.error(`[API Route] Network fetch error for ${videoId}:`, error);
    const message = error instanceof Error ? error.message : 'An unexpected server error occurred';
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 502 });
  }
}

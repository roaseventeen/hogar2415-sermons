
import fs from "node:fs/promises";

const API_KEY = process.env.YOUTUBE_API_KEY;
const PLAYLIST_ID = "PLKXYxbfn-M3U";
const OUTPUT_FILE = "sermons.generated.json";

if (!API_KEY) {
  throw new Error("Falta configurar el secreto YOUTUBE_API_KEY.");
}

async function youtube(endpoint, params = {}) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  url.search = new URLSearchParams({
    ...params,
    key: API_KEY,
  }).toString();

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`YouTube API respondió ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  const videoIds = [];
  let pageToken;

  do {
    const page = await youtube("playlistItems", {
      part: "snippet,contentDetails",
      playlistId: PLAYLIST_ID,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });

    for (const item of page.items ?? []) {
      const id =
        item.contentDetails?.videoId ??
        item.snippet?.resourceId?.videoId;

      if (id && !videoIds.includes(id)) {
        videoIds.push(id);
      }
    }

    pageToken = page.nextPageToken;
  } while (pageToken);

  if (videoIds.length === 0) {
    throw new Error("La playlist no devolvió videos. No se modificó el catálogo.");
  }

  const sermons = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const details = await youtube("videos", {
      part: "snippet,contentDetails",
      id: batch.join(","),
    });

    for (const video of details.items ?? []) {
      const snippet = video.snippet;
      const videoId = video.id;

      if (!snippet?.title || !videoId) continue;

      const duration = video.contentDetails?.duration ?? "";
      const match = duration.match(
        /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
      );

      const durationSeconds = match
        ? Number(match[1] ?? 0) * 3600 +
          Number(match[2] ?? 0) * 60 +
          Number(match[3] ?? 0)
        : 0;

      sermons.push({
        id: `yt-${videoId}`,
        youtubeVideoId: videoId,
        title: snippet.title,
        preacher: "",
        date: snippet.publishedAt,
        thumbnailUrl:
          snippet.thumbnails?.maxres?.url ??
          snippet.thumbnails?.high?.url ??
          snippet.thumbnails?.medium?.url ??
          snippet.thumbnails?.default?.url,
        durationSeconds,
      });
    }
  }

  if (sermons.length === 0) {
    throw new Error("No se pudieron obtener detalles de los videos.");
  }

  const temporaryFile = `${OUTPUT_FILE}.tmp`;

  await fs.writeFile(
    temporaryFile,
    `${JSON.stringify(sermons, null, 2)}\n`,
    "utf8"
  );

  await fs.rename(temporaryFile, OUTPUT_FILE);

  console.log(`Catálogo actualizado: ${sermons.length} videos.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

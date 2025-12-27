
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const apiKey = process.env.YOUTUBE_API_KEY;
const videoId = process.env.YOUTUBE_VIDEO_ID;

if (!apiKey || !videoId) {
    console.error('Missing YOUTUBE_API_KEY or YOUTUBE_VIDEO_ID in .env');
    process.exit(1);
}

console.log('--- Debugging YouTube API ---');
console.log(`Video ID: ${videoId}`);
console.log(`API Key: ${apiKey.slice(0, 5)}...`);

async function run() {
    const youtube = google.youtube({ version: 'v3', auth: apiKey });

    try {
        console.log('Fetching video details...');
        // Explicitly cast or assertions to satisfy TS
        const res = await youtube.videos.list({
            part: ['liveStreamingDetails', 'snippet', 'status'],
            id: [videoId]
        } as any);

        console.log('--- API Response ---');
        console.log(JSON.stringify(res.data, null, 2));

        const items = (res.data as any).items || [];
        if (items.length === 0) {
            console.error('Error: Video not found. Check if the Video ID is correct.');
        } else {
            const item = items[0];
            const liveDetails = item.liveStreamingDetails;
            if (liveDetails) {
                console.log('--- Live Details ---');
                console.log(`Actual Start Time: ${liveDetails.actualStartTime}`);
                console.log(`Active Live Chat ID: ${liveDetails.activeLiveChatId}`); // This is what we need
            } else {
                console.error('Error: No liveStreamingDetails found. Is this video a Live Stream?');
            }
        }

    } catch (error: any) {
        console.error('--- API Error ---');
        console.error(error.message);
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        }
    }
}

run();

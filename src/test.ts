import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { VideoEmbed } from './models/VideoEmbed.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/';
const DATABASE_NAME = process.env.DATABASE_NAME || 'embed-video';

async function testFindVideos(username?: string) {
  try {
    console.log('Connecting to MongoDB...');
    console.log(`URI: ${MONGODB_URI}${DATABASE_NAME}`);
    
    await mongoose.connect(`${MONGODB_URI}${DATABASE_NAME}`);
    console.log('✅ Connected to MongoDB\n');

    // Build query
    const query = username ? { owner: username } : {};
    
    console.log(`Searching for videos${username ? ` by user: ${username}` : ' (all users)'}...\n`);

    // Find videos
    const videos = await VideoEmbed.find(query)
      .limit(20)
      .sort({ createdAt: -1 });

    console.log(`Found ${videos.length} video(s):\n`);

    if (videos.length === 0) {
      console.log('No videos found. Try a different username or check the collection.');
    } else {
      videos.forEach((video, index) => {
        console.log(`${index + 1}. Owner: ${video.owner}`);
        console.log(`   Permlink: ${video.permlink}`);
        console.log(`   Frontend App: ${video.frontend_app}`);
        console.log(`   Status: ${video.status}`);
        console.log(`   Short: ${video.short}`);
        console.log(`   Created: ${video.createdAt}`);
        console.log(`   Processed: ${video.processed || false}`);
        if (video.embed_url) {
          console.log(`   Embed URL: ${video.embed_url}`);
          console.log(`   Embed Title: ${video.embed_title}`);
        }
        console.log('');
      });
    }

    console.log('\n📊 Summary:');
    console.log(`Total videos found: ${videos.length}`);
    console.log(`Processed: ${videos.filter(v => v.processed).length}`);
    console.log(`Unprocessed: ${videos.filter(v => !v.processed).length}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Get username from command line argument
const username = process.argv[2];

if (!username) {
  console.log('Usage: npm run test -- <username>');
  console.log('Example: npm run test -- ismeris');
  console.log('\nOr run without username to see all videos (limited to 20)');
  console.log('');
}

testFindVideos(username);

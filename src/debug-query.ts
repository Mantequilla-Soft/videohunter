import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { VideoEmbed } from './models/VideoEmbed.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/';
const DATABASE_NAME = process.env.DATABASE_NAME || 'threespeak';

async function debugQuery() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(`${MONGODB_URI}${DATABASE_NAME}`);
    console.log('✅ Connected\n');

    // Test 1: Count all documents
    const totalCount = await VideoEmbed.countDocuments();
    console.log(`Total documents in collection: ${totalCount}`);

    // Test 2: Count by owner
    const ismerisCount = await VideoEmbed.countDocuments({ owner: 'ismeris' });
    console.log(`Documents for ismeris: ${ismerisCount}`);

    // Test 3: Count unprocessed
    const unprocessedCount = await VideoEmbed.countDocuments({
      $or: [
        { processed: false },
        { processed: { $exists: false } },
      ],
    });
    console.log(`Unprocessed documents: ${unprocessedCount}`);

    // Test 4: Count unprocessed + published
    const unprocessedPublished = await VideoEmbed.countDocuments({
      $or: [
        { processed: false },
        { processed: { $exists: false } },
      ],
      status: 'published',
    });
    console.log(`Unprocessed + published: ${unprocessedPublished}`);

    // Test 5: Get one sample
    const sample = await VideoEmbed.findOne({ owner: 'ismeris' });
    console.log('\nSample document:');
    console.log(JSON.stringify(sample, null, 2));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugQuery();

# Video Embed Worker Service

A background worker service that monitors video embeds in MongoDB and enriches them with usage information from the Hive blockchain via HAFSQL.

## Features

- 🔄 **Background Processing**: Runs continuously, processing videos every 10 minutes (configurable)
- 🎯 **Smart Detection**: Identifies whether videos are used in posts, snaps, waves, or comments
- 📊 **Batch Processing**: Efficiently processes videos in configurable batches
- 🔍 **HAFSQL Integration**: Queries Hive blockchain data using `irreversible_operations_view`
- 💾 **MongoDB Integration**: Updates video records with embed URLs and titles
- 🛡️ **Error Handling**: Robust error handling and logging
- 🔄 **Resume Support**: Automatically skips already-processed videos on restart

## Architecture

```
src/
├── config/           # Configuration management
├── models/           # Mongoose schemas
├── services/         # Core business logic
│   ├── database.ts   # Database connection management
│   ├── hafsql.ts     # HAFSQL query service
│   └── worker.ts     # Main worker logic
├── types/            # TypeScript type definitions
├── utils/            # Utility functions (logger)
└── index.ts          # Application entry point
```

## Prerequisites

- Node.js (v18 or higher)
- MongoDB instance
- Access to HAFSQL database (configured by default)

## Installation

### Manual Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your settings
```

3. Build the project:
```bash
npm run build
```

## Usage

### Using Systemd (Recommended for Production)

Start the service:
```bash
sudo systemctl start video-embed-worker
```

Enable auto-start on boot:
```bash
sudo systemctl enable video-embed-worker
```

Check status:
```bash
sudo systemctl status video-embed-worker
```

View logs:
```bash
sudo journalctl -u video-embed-worker -f
```

Stop the service:
```bash
sudo systemctl stop video-embed-worker
```

### Manual Execution

#### Development Mode
```bash
npm run dev
```

Or using the Node loader directly:
```bash
NODE_OPTIONS='--loader ts-node/esm' node src/index.ts
```

#### Production Mode

1. Build the project:
```bash
npm run build
```

2. Start the worker:
```bash
npm start
```

## Testing

Test MongoDB connection:
```bash
npm run test -- <username>
# Example: npm run test -- ismeris
```

Test HAFSQL connection and query:
```bash
npm run test:hafsql -- <username> <permlink>
# Example: npm run test:hafsql -- ismeris dyprlkq4
```

## Current Status

✅ MongoDB connection working  
✅ HAFSQL connection working  
✅ Video detection working  
⚠️  HAFSQL query needs column verification (public endpoint has connectivity issues)

**Note**: The HAFSQL public endpoint (`hafsql-sql.mahdiyari.info`) can be unreliable. If queries fail, the worker will continue and retry on the next cycle.

## How It Works

1. **Polling**: The worker checks MongoDB every 10 minutes for unprocessed video embeds
2. **Batch Fetching**: Retrieves a batch of unprocessed videos (default: 10)
3. **HAFSQL Query**: For each video, queries the Hive blockchain to find where it was used
4. **Analysis**: Determines if the video was used in:
   - **Post**: A root-level post (gets the post title)
   - **Snap**: A short-form content piece on Hive
   - **Wave**: Another short-form content type
   - **Comment**: A regular comment
5. **Update**: Updates the MongoDB record with:
   - `embed_url`: Full permlink to the content
   - `embed_title`: Title of the post or content type
   - `processed`: Mark as processed
   - `processedAt`: Timestamp

## MongoDB Schema

The worker expects a collection with the following structure:

```typescript
{
  owner: string;              // Video owner username
  permlink: string;           // Video permlink
  frontend_app: string;       // App that created the embed
  status: string;             // "published", etc.
  input_cid: string;          // IPFS CID
  manifest_cid: string;       // Manifest CID
  thumbnail_url: string;      // Thumbnail URL
  short: boolean;             // Is short-form content
  duration: number | null;    // Video duration
  size: number;               // File size
  encodingProgress: number;   // Encoding progress (0-100)
  originalFilename: string;   // Original file name
  views: number;              // View count
  
  // Added by worker:
  embed_url?: string;         // Where the video was used
  embed_title?: string;       // Title of the post/content
  processed?: boolean;        // Processing status
  processedAt?: Date;         // When it was processed
}
```

## Configuration Options

Configure the service by editing the `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | - | MongoDB connection string (required) |
| `DATABASE_NAME` | `threespeak` | MongoDB database name |
| `WORKER_INTERVAL_MS` | `600000` (10 min) | How often to check for new videos |
| `BATCH_SIZE` | `10` | Number of videos to process per batch |
| `LOG_LEVEL` | `info` | Logging level |

### Performance Tuning

**For faster initial processing** (catching up on backlog):
```env
WORKER_INTERVAL_MS=60000   # 1 minute
BATCH_SIZE=50              # 50 videos per batch
```

**For production steady-state**:
```env
WORKER_INTERVAL_MS=600000  # 10 minutes  
BATCH_SIZE=10              # 10 videos per batch
```

**Processing time estimate**: With 306 unprocessed videos:
- Default settings (10 every 10 min): ~5 hours
- Fast settings (50 every 1 min): ~6 minutes

## HAFSQL Query

The service uses the following optimized query on `irreversible_operations_view`:

```sql
SELECT
  body->'value'->>'author' as author,
  body->'value'->>'permlink' as permlink,
  body->'value'->>'parent_author' as parent_author,
  body->'value'->>'parent_permlink' as parent_permlink,
  body->'value'->>'body' as body,
  body->'value'->>'title' as title
FROM hive.irreversible_operations_view
WHERE
  op_type_id = 1  -- comment operations
  AND (
    body->'value'->>'body' ILIKE '%https://play.3speak.tv/embed?v=owner/permlink%'
    OR body->'value'->>'json_metadata' ILIKE '%https://play.3speak.tv/embed?v=owner/permlink%'
  )
  AND body->'value'->>'author' = 'owner'
ORDER BY block_num DESC
LIMIT 50
```

**Note**: Uses `irreversible_operations_view` instead of `operations_view` for:
- Smaller dataset
- Faster scans
- No blockchain reorganization noise

## Logging

The service provides detailed logging for:
- Database connections
- Batch processing progress
- Individual video processing
- Errors and warnings

Example output:
- HAFSQL connection timeouts are handled gracefully

## Graceful Shutdown

The service handles `SIGINT` and `SIGTERM` signals gracefully:
- Disconnects from MongoDB
- Closes HAFSQL connection pool
- Exits cleanly

## Production Deployment

### Systemd Service (Recommended)

The install script creates a systemd service that:
- Runs as your user (not root)
- Auto-restarts on failure
- Logs to systemd journal
- Starts on boot (if enabled)
- Includes security hardening

### Alternative: PM2

```bash
pm2 start dist/index.js --name video-embed-worker
pm2 save
pm2 startup
```

### Docker

Create a `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

## Security Notes

- **No open ports**: This is a background worker that only makes outbound connections
- **No incoming traffic**: No HTTP server or exposed services
- **Firewall**: No firewall rules needed (only outbound to MongoDB and HAFSQL)
- **Credentials**: Keep `.env` file secure with MongoDB credential
- Closes HAFSQL connection pool
- Exits cleanly

## Production Deployment

For production, consider:

1. **Process Manager**: Use PM2 or similar
```bash
pm2 start dist/index.js --name video-embed-worker
```

2. **Docker**: Create a Dockerfile
3. **Monitoring**: Add monitoring for worker health
4. **Alerts**: Set up alerts for processing failures

## Future Enhancements

- [ ] Add retry mechanism with exponential backoff
- [ ] Implement dead letter queue for failed videos
- [ ] Add metrics/monitoring endpoint
- [ ] Support for multiple video platforms
- [ ] Webhook notifications for processed videos

## License

ISC

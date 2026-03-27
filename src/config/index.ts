import dotenv from 'dotenv';

dotenv.config();

export const config = {
  mongodb: {
    uri: `${process.env.MONGODB_URI || 'mongodb://localhost:27017/'}${process.env.DATABASE_NAME || 'threespeak'}`,
  },
  hafsql: {
    host: process.env.HAFSQL_HOST || 'hafsql-sql.mahdiyari.info',
    port: parseInt(process.env.HAFSQL_PORT || '5432'),
    database: process.env.HAFSQL_DATABASE || 'haf_block_log',
    user: process.env.HAFSQL_USER || 'hafsql_public',
    password: process.env.HAFSQL_PASSWORD || 'hafsql_public',
  },
  worker: {
    intervalMs: parseInt(process.env.WORKER_INTERVAL_MS || '600000'), // 10 minutes
    batchSize: parseInt(process.env.BATCH_SIZE || '10'),
  },
  hive: {
    rpcNodes: (process.env.HIVE_RPC_NODES || 'https://api.hive.blog,https://api.deathwing.me,https://anyx.io').split(','),
    enrichmentBatchSize: parseInt(process.env.ENRICHMENT_BATCH_SIZE || '10'),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

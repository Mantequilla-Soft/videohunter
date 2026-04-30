import { DatabaseService } from './services/database.js';
import { WorkerService } from './services/worker.js';
import { HealerService } from './services/healer.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    logger.info('Starting Video Embed Worker Service...');

    // Connect to databases
    await DatabaseService.connectMongoDB();
    await DatabaseService.connectHAFSQL();

    // Initialize and start worker
    const worker = new WorkerService();
    worker.start();

    // Initialize and start healer (repairs enriched-but-unflagged entries)
    const healer = new HealerService();
    healer.start();

    logger.info('Worker and healer services started successfully');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await DatabaseService.disconnectAll();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await DatabaseService.disconnectAll();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Fatal error starting worker service:', error);
    process.exit(1);
  }
}

main();

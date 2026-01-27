import mongoose from 'mongoose';
import { Pool } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export class DatabaseService {
  private static mongooseConnection: typeof mongoose | null = null;
  private static pgPool: Pool | null = null;

  static async connectMongoDB(): Promise<void> {
    try {
      if (this.mongooseConnection) {
        logger.info('MongoDB already connected');
        return;
      }

      this.mongooseConnection = await mongoose.connect(config.mongodb.uri);
      logger.info('MongoDB connected successfully');
    } catch (error) {
      logger.error('MongoDB connection error:', error);
      throw error;
    }
  }

  static async connectHAFSQL(): Promise<Pool> {
    try {
      if (this.pgPool) {
        return this.pgPool;
      }

      this.pgPool = new Pool({
        host: config.hafsql.host,
        port: config.hafsql.port,
        database: config.hafsql.database,
        user: config.hafsql.user,
        password: config.hafsql.password,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Test connection
      const client = await this.pgPool.connect();
      logger.info('HAFSQL connected successfully');
      client.release();

      return this.pgPool;
    } catch (error) {
      logger.error('HAFSQL connection error:', error);
      throw error;
    }
  }

  static async disconnectAll(): Promise<void> {
    try {
      if (this.mongooseConnection) {
        await mongoose.disconnect();
        this.mongooseConnection = null;
        logger.info('MongoDB disconnected');
      }

      if (this.pgPool) {
        await this.pgPool.end();
        this.pgPool = null;
        logger.info('HAFSQL disconnected');
      }
    } catch (error) {
      logger.error('Error disconnecting databases:', error);
      throw error;
    }
  }

  static getPgPool(): Pool {
    if (!this.pgPool) {
      throw new Error('HAFSQL pool not initialized');
    }
    return this.pgPool;
  }
}

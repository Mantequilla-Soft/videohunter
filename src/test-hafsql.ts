import dotenv from 'dotenv';
import { Pool } from 'pg';
import { config } from './config/index.js';

dotenv.config();

async function testHAFSQL(owner: string, permlink: string) {
  const pool = new Pool({
    host: config.hafsql.host,
    port: config.hafsql.port,
    database: config.hafsql.database,
    user: config.hafsql.user,
    password: config.hafsql.password,
    connectionTimeoutMillis: 30000, // 30 seconds
    query_timeout: 60000, // 60 seconds for queries
  });

  try {
    console.log('Connecting to HAFSQL...');
    console.log(`Host: ${config.hafsql.host}`);
    console.log(`Database: ${config.hafsql.database}\n`);

    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Connected to HAFSQL\n');

    // First, let's see what schemas and tables are available
    console.log('📋 Checking available schemas and tables...\n');
    
    const schemasQuery = `
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schema_name
    `;
    const schemas = await pool.query(schemasQuery);
    console.log('Available schemas:', schemas.rows.map(r => r.schema_name).join(', '));

    // Check for tables in hive schema
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'hive' 
      AND table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY table_name
      LIMIT 50
    `;
    const tables = await pool.query(tablesQuery);
    console.log('Tables/views in hive schema:');
    tables.rows.forEach(r => console.log('  -', r.table_name));
    console.log('');

    // Check hivemind_app schema for comments
    const hivemindQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'hivemind_app' 
      AND table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY table_name
      LIMIT 50
    `;
    const hivemindTables = await pool.query(hivemindQuery);
    console.log('Tables/views in hivemind_app schema:');
    hivemindTables.rows.forEach(r => console.log('  -', r.table_name));
    console.log('');

    const embedUrl = `https://play.3speak.tv/embed?v=${owner}/${permlink}`;
    console.log(`🔍 Searching for embed URL: ${embedUrl}\n`);

    // First, let's check the structure of operations_view
    console.log('Checking operations_view structure...\n');
    const structureQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'hive' 
      AND table_name = 'operations_view'
      ORDER BY ordinal_position
    `;
    const structure = await pool.query(structureQuery);
    console.log('Columns in operations_view:');
    structure.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`));
    console.log('');

    // Search using operations table which contains comment operations
    const searchPattern = `%${embedUrl}%`;
    
    const query = `
      SELECT
        (body->'value'->>'author')::text as author,
        (body->'value'->>'permlink')::text as permlink,
        (body->'value'->>'parent_author')::text as parent_author,
        (body->'value'->>'parent_permlink')::text as parent_permlink,
        (body->'value'->>'title')::text as title,
        (body->'value'->>'body')::text as body_text,
        block_num
      FROM hive.irreversible_operations_view
      WHERE
        op_type_id = 1  -- comment operation
        AND (
          (body->'value'->>'body')::text ILIKE $1
          OR (body->'value'->>'json_metadata')::text ILIKE $1
        )
      ORDER BY block_num DESC
      LIMIT 10
    `;

    console.log('Executing query...\n');
    const result = await pool.query(query, [searchPattern]);

    console.log(`Found ${result.rows.length} result(s):\n`);

    if (result.rows.length === 0) {
      console.log('No posts/comments found containing this video embed.');
      console.log('This could mean:');
      console.log('  - Video hasn\'t been posted yet');
      console.log('  - Video was posted with different URL format');
      console.log('  - Need to check alternative URL patterns');
    } else {
      result.rows.forEach((row, index) => {
        console.log(`${index + 1}. Author: ${row.author}`);
        console.log(`   Permlink: ${row.permlink}`);
        console.log(`   Parent: ${row.parent_author}/${row.parent_permlink}`);
        console.log(`   Title: ${row.title || '(no title - comment/snap/wave)'}`);
        console.log(`   Created: ${row.created_at}`);
        console.log(`   Is Post: ${row.parent_author === ''}`);
        console.log(`   Full URL: @${row.author}/${row.permlink}`);
        
        // Determine content type
        if (row.parent_author === '') {
          console.log(`   Type: 📄 Post`);
        } else if (row.parent_permlink === 'hive-snap') {
          console.log(`   Type: 📸 Snap`);
        } else if (row.parent_permlink === 'hive-wave') {
          console.log(`   Type: 🌊 Wave`);
        } else {
          console.log(`   Type: 💬 Comment`);
        }
        
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('✅ Disconnected from HAFSQL');
  }
}

// Get username and permlink from command line
const owner = process.argv[2];
const permlink = process.argv[3];

if (!owner || !permlink) {
  console.log('Usage: npm run test:hafsql -- <owner> <permlink>');
  console.log('Example: npm run test:hafsql -- ismeris dyprlkq4');
  process.exit(1);
}

testHAFSQL(owner, permlink);

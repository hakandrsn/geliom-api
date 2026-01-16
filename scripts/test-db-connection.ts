import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

async function testConnection() {
  const envPath = path.join(process.cwd(), '.env');
  console.log(`📂 Loading .env from: ${envPath}`);
  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.error('❌ Error loading .env:', result.error);
  }

  const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME, DB_USERNAME } = process.env;

  console.log('🔍 Loaded Environment Variables:');
  console.log(`   DB_HOST: ${DB_HOST ? 'Set' : 'Missing'} (${DB_HOST})`);
  console.log(`   DB_PORT: ${DB_PORT ? 'Set' : 'Missing'} (${DB_PORT})`);
  console.log(`   DB_NAME: ${DB_NAME ? 'Set' : 'Missing'} (${DB_NAME})`);
  console.log(`   DB_USERNAME: ${DB_USERNAME ? 'Set' : 'Missing'} (${DB_USERNAME})`);

  // Support both DB_USER and DB_USERNAME
  const user = DB_USERNAME || DB_USER;

  if (!user || !DB_PASSWORD || !DB_HOST || !DB_PORT || !DB_NAME) {
    console.error('❌ Missing database configuration in .env');
    console.log('Required: DB_USERNAME, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME');
    process.exit(1);
  }

  const connectionString = `postgresql://${user}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

  console.log(`📡 Testing connection to: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  // Mask password for security
  console.log(`🔌 Connection String: postgresql://${user}:******@${DB_HOST}:${DB_PORT}/${DB_NAME}`);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: connectionString,
      },
    },
  });

  try {
    console.log('⏳ Connecting...');
    await prisma.$connect();
    console.log('✅ Connection successful!');

    // Simple query to verify
    const result = await prisma.$queryRaw`SELECT 1 as result`;
    console.log('📊 Query Result:', result);

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

testConnection();

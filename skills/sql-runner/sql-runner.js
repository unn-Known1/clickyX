// SQL Runner — Run SQL queries against SQLite, PostgreSQL, or MySQL
// Usage: { action: "query"|"tables"|"schema"|"export", dbType, dbPath/connectionString, sql }
// Requires: sqlite3, pg, or mysql2 installed (or sqlite3 CLI)

module.exports = { main };

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runSqlite(dbPath, sql) {
  // Try sqlite3 CLI
  try {
    const out = execSync(`sqlite3 -json "${dbPath}" "${sql.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8', timeout: 30000,
    });
    try { return JSON.parse(out || '[]'); } catch { return out; }
  } catch (e) {
    throw new Error(`sqlite3 CLI failed: ${e.message}. Install sqlite3.`);
  }
}

async function runPostgres(connectionString, sql) {
  let pg;
  try { pg = require('pg'); } catch { throw new Error('pg package not installed. Run: npm install pg'); }
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(sql);
    return { rows: res.rows, rowCount: res.rowCount, command: res.command };
  } finally {
    await client.end();
  }
}

async function runMysql(connectionString, sql) {
  let mysql;
  try { mysql = require('mysql2/promise'); } catch { throw new Error('mysql2 package not installed. Run: npm install mysql2'); }
  const conn = await mysql.createConnection(connectionString);
  try {
    const [rows, fields] = await conn.execute(sql);
    return { rows, columns: fields?.map((f) => f.name) };
  } finally {
    await conn.end();
  }
}

async function main(args) {
  const { action, dbType = 'sqlite', dbPath, connectionString, sql, outputFormat = 'json' } = args || {};

  const conn = connectionString || dbPath;
  if (!conn && dbType === 'sqlite') return { error: 'Missing dbPath for SQLite' };
  if (!conn && dbType !== 'sqlite') return { error: 'Missing connectionString for database' };

  try {
    switch (action) {
      case 'query': {
        if (!sql) return { error: 'Missing SQL query' };
        let result;
        if (dbType === 'sqlite') result = runSqlite(conn, sql);
        else if (dbType === 'postgres' || dbType === 'postgresql') result = await runPostgres(conn, sql);
        else if (dbType === 'mysql') result = await runMysql(conn, sql);
        else return { error: `Unknown dbType: ${dbType}. Use: sqlite, postgres, mysql` };

        const rows = Array.isArray(result) ? result : result.rows || result;
        return { result: `Query executed`, rows, rowCount: rows.length, sql: sql.slice(0, 200) };
      }

      case 'tables': {
        let tablesSQL;
        if (dbType === 'sqlite') tablesSQL = "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name";
        else if (dbType === 'postgres' || dbType === 'postgresql') tablesSQL = "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name";
        else if (dbType === 'mysql') tablesSQL = 'SHOW TABLES';
        else return { error: `Unknown dbType: ${dbType}` };

        let rows;
        if (dbType === 'sqlite') rows = runSqlite(conn, tablesSQL);
        else if (dbType === 'postgres' || dbType === 'postgresql') rows = (await runPostgres(conn, tablesSQL)).rows;
        else rows = (await runMysql(conn, tablesSQL)).rows;

        return { result: `${rows.length} tables/views`, tables: rows };
      }

      case 'schema': {
        const table = args.table;
        if (!table) return { error: 'Missing table name' };
        let schemaSQL;
        if (dbType === 'sqlite') schemaSQL = `PRAGMA table_info("${table}")`;
        else if (dbType === 'postgres' || dbType === 'postgresql') schemaSQL = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '${table}' AND table_schema = 'public' ORDER BY ordinal_position`;
        else if (dbType === 'mysql') schemaSQL = `DESCRIBE \`${table}\``;
        else return { error: `Unknown dbType` };

        let rows;
        if (dbType === 'sqlite') rows = runSqlite(conn, schemaSQL);
        else if (dbType === 'postgres' || dbType === 'postgresql') rows = (await runPostgres(conn, schemaSQL)).rows;
        else rows = (await runMysql(conn, schemaSQL)).rows;

        return { result: `Schema for ${table}`, columns: rows };
      }

      default:
        return { error: `Unknown action: ${action}. Use: query, tables, schema` };
    }
  } catch (err) {
    console.error('[sql-runner]', err.message);
    return { error: err.message };
  }
}

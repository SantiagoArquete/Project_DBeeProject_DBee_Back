const { v4: uuidv4 } = require('uuid');
const { Pool }       = require('pg');
const mysql          = require('mysql2/promise');
// const Database       = require('better-sqlite3');

/** In-memory map of active connections  { id → {type, name, pool|db, config} } */
const store = new Map();

/* ─────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────── */
function quote(type, identifier) {
  return type === 'mysql'
    ? `\`${identifier}\``
    : `"${identifier}"`;
}

function tableRef(type, schema, table) {
  return type === 'sqlite'
    ? quote(type, table)
    : `${quote(type, schema)}.${quote(type, table)}`;
}

/* ─────────────────────────────────────────────────────────
   ConnectionManager
───────────────────────────────────────────────────────── */
class ConnectionManager {

  /* ── create ─────────────────────────────────────────── */
  async createConnection(cfg) {
    const { type, name, host, port, database, username, password, filename } = cfg;
    const id = uuidv4();
    let entry;

    try {
      switch (type) {
        case 'postgresql': {
          const pool = new Pool({
            host, port: parseInt(port) || 5432,
            database, user: username, password,
            max: 5, connectionTimeoutMillis: 10_000,
          });
          const c = await pool.connect();
          c.release();
          entry = { type, name, pool };
          break;
        }
        case 'mysql': {
          const pool = mysql.createPool({
            host, port: parseInt(port) || 3306,
            database, user: username, password,
            connectionLimit: 5, connectTimeout: 10_000,
          });
          await pool.query('SELECT 1');
          entry = { type, name, pool };
          break;
        }
        case 'sqlite': {
          const db = new Database(filename, { timeout: 10_000 });
          entry = { type, name, db };
          break;
        }
        default:
          throw new Error(`Unsupported type: ${type}`);
      }
    } catch (err) {
      throw new Error(`Connection failed: ${err.message}`);
    }

    store.set(id, { ...entry, id, config: { ...cfg, password: '***' } });
    return { id, name, type, status: 'connected' };
  }

  /* ── execute ────────────────────────────────────────── */
  async executeQuery(id, sql, params = []) {
    const conn = this._get(id);
    const t0 = Date.now();

    switch (conn.type) {
      case 'postgresql': {
        const r = await conn.pool.query(sql, params);
        return {
          rows:     r.rows,
          fields:   (r.fields || []).map(f => ({ name: f.name })),
          rowCount: r.rowCount,
          command:  r.command,
          duration: Date.now() - t0,
        };
      }
      case 'mysql': {
        const [results, fieldDefs] = await conn.pool.query(sql, params);
        if (Array.isArray(results)) {
          return {
            rows:     results,
            fields:   (fieldDefs || []).map(f => ({ name: f.name })),
            rowCount: results.length,
            duration: Date.now() - t0,
          };
        }
        return { rows: [], fields: [], rowCount: results.affectedRows, duration: Date.now() - t0 };
      }
      case 'sqlite': {
        const cmd = sql.trim().split(/\s+/)[0].toUpperCase();
        const stmt = conn.db.prepare(sql);
        if (['SELECT', 'PRAGMA', 'WITH'].includes(cmd)) {
          const rows = stmt.all(...params);
          return {
            rows,
            fields: rows.length ? Object.keys(rows[0]).map(n => ({ name: n })) : [],
            rowCount: rows.length,
            duration: Date.now() - t0,
          };
        }
        const info = stmt.run(...params);
        return { rows: [], fields: [], rowCount: info.changes, duration: Date.now() - t0 };
      }
    }
  }

  /* ── schema helpers ─────────────────────────────────── */
  async getSchemas(id) {
    const conn = this._get(id);
    switch (conn.type) {
      case 'postgresql': {
        const r = await conn.pool.query(
          `SELECT schema_name FROM information_schema.schemata
           WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
           ORDER BY schema_name`
        );
        return r.rows.map(r => r.schema_name);
      }
      case 'mysql': {
        const [rows] = await conn.pool.query('SHOW DATABASES');
        const hidden = new Set(['information_schema','performance_schema','mysql','sys']);
        return rows.map(r => r.Database).filter(d => !hidden.has(d));
      }
      case 'sqlite':
        return ['main'];
    }
  }

  async getTables(id, schema = 'public') {
    const conn = this._get(id);
    switch (conn.type) {
      case 'postgresql': {
        const r = await conn.pool.query(
          `SELECT table_name, table_type
           FROM information_schema.tables
           WHERE table_schema = $1 ORDER BY table_name`, [schema]
        );
        return r.rows;
      }
      case 'mysql': {
        const [rows] = await conn.pool.query(
          `SELECT TABLE_NAME as table_name, TABLE_TYPE as table_type
           FROM information_schema.tables WHERE table_schema = ? ORDER BY TABLE_NAME`, [schema]
        );
        return rows;
      }
      case 'sqlite': {
        return conn.db.prepare(
          `SELECT name as table_name, type as table_type
           FROM sqlite_master WHERE type IN ('table','view') ORDER BY name`
        ).all();
      }
    }
  }

  async getColumns(id, schema, table) {
    const conn = this._get(id);
    switch (conn.type) {
      case 'postgresql': {
        const r = await conn.pool.query(
          `SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
                  CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_primary_key
           FROM information_schema.columns c
           LEFT JOIN (
             SELECT ku.column_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage ku
               ON tc.constraint_name = ku.constraint_name
               AND tc.table_schema = ku.table_schema
             WHERE tc.table_schema=$1 AND tc.table_name=$2 AND tc.constraint_type='PRIMARY KEY'
           ) pk USING (column_name)
           WHERE c.table_schema=$1 AND c.table_name=$2
           ORDER BY c.ordinal_position`, [schema, table]
        );
        return r.rows;
      }
      case 'mysql': {
        const [rows] = await conn.pool.query(
          `SELECT COLUMN_NAME as column_name, DATA_TYPE as data_type,
                  IS_NULLABLE as is_nullable, COLUMN_DEFAULT as column_default,
                  CASE WHEN COLUMN_KEY='PRI' THEN 'YES' ELSE 'NO' END AS is_primary_key
           FROM information_schema.columns
           WHERE table_schema=? AND table_name=? ORDER BY ORDINAL_POSITION`, [schema, table]
        );
        return rows;
      }
      case 'sqlite': {
        return conn.db.prepare(`PRAGMA table_info(${quote('sqlite', table)})`).all()
          .map(r => ({
            column_name: r.name,
            data_type:   r.type || 'TEXT',
            is_nullable: r.notnull ? 'NO' : 'YES',
            column_default: r.dflt_value,
            is_primary_key: r.pk ? 'YES' : 'NO',
          }));
      }
    }
  }

  /* ── CRUD helpers ───────────────────────────────────── */
  async insertRow(id, schema, table, data) {
    const conn  = this._get(id);
    const keys  = Object.keys(data);
    const vals  = Object.values(data);
    const q     = (i) => conn.type === 'postgresql' ? `$${i + 1}` : '?';
    const cols  = keys.map(k => quote(conn.type, k)).join(', ');
    const ph    = keys.map((_, i) => q(i)).join(', ');
    const ref   = tableRef(conn.type, schema, table);
    console.log("dado",ref);
    const sql   = conn.type === 'postgresql'
      ? `INSERT INTO ${ref} (${cols}) VALUES (${ph}) RETURNING *`
      : `INSERT INTO ${ref} (${cols}) VALUES (${ph})`;
    return this.executeQuery(id, sql, vals);
  }

  async updateRow(id, schema, table, data, where) {
    const conn  = this._get(id);
    const ref   = tableRef(conn.type, schema, table);
    const dKeys = Object.keys(data);
    const wKeys = Object.keys(where);
    const vals  = [...Object.values(data), ...Object.values(where)];

    if (conn.type === 'postgresql') {
      const set = dKeys.map((k, i) => `${quote('postgresql', k)} = $${i + 1}`).join(', ');
      const whr = wKeys.map((k, i) => `${quote('postgresql', k)} = $${dKeys.length + i + 1}`).join(' AND ');
      return this.executeQuery(id, `UPDATE ${ref} SET ${set} WHERE ${whr}`, vals);
    } else {
      const set = dKeys.map(k => `${quote(conn.type, k)} = ?`).join(', ');
      const whr = wKeys.map(k => `${quote(conn.type, k)} = ?`).join(' AND ');
      return this.executeQuery(id, `UPDATE ${ref} SET ${set} WHERE ${whr}`, vals);
    }
  }

  async deleteRow(id, schema, table, where) {
    const conn  = this._get(id);
    const ref   = tableRef(conn.type, schema, table);
    const wKeys = Object.keys(where);
    const vals  = Object.values(where);

    if (conn.type === 'postgresql') {
      const whr = wKeys.map((k, i) => `${quote('postgresql', k)} = $${i + 1}`).join(' AND ');
      return this.executeQuery(id, `DELETE FROM ${ref} WHERE ${whr}`, vals);
    } else {
      const whr = wKeys.map(k => `${quote(conn.type, k)} = ?`).join(' AND ');
      return this.executeQuery(id, `DELETE FROM ${ref} WHERE ${whr}`, vals);
    }
  }

  /* ── lifecycle ──────────────────────────────────────── */
  async closeConnection(id) {
    const conn = store.get(id);
    if (!conn) return;
    try {
      if (conn.pool) await conn.pool.end();
      if (conn.db)   conn.db.close();
    } catch (_) {}
    store.delete(id);
  }

  listConnections() {
    return [...store.values()].map(({ id, name, type, config }) => ({ id, name, type, config }));
  }

  _get(id) {
    const conn = store.get(id);
    if (!conn) throw new Error('Connection not found or already closed');
    return conn;
  }
}

module.exports = new ConnectionManager();

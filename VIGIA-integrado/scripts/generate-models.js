#!/usr/bin/env node
'use strict';

/**
 * Genera un modelo Sequelize (src/models/<Tabla>.js) por cada
 * CREATE TABLE de database/vigia_schema.sql, mas un archivo de
 * metadata de asociaciones (src/models/_associations.json) que
 * src/models/index.js usa para conectar los belongsTo/hasMany.
 *
 * Es el "modo escalable": si el esquema SQL cambia (se agrega una
 * tabla, una columna, una FK), se corre `npm run generate:models`
 * de nuevo y los modelos quedan al dia sin tocarlos a mano.
 *
 * Uso: node scripts/generate-models.js
 */

const fs = require('fs');
const path = require('path');

const SQL_PATH = path.join(__dirname, '..', 'database', 'vigia_schema.sql');
const OUT_DIR = path.join(__dirname, '..', 'src', 'models');
const ASSOC_PATH = path.join(OUT_DIR, '_associations.json');

function splitTopLevel(str, sep = ',') {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}

const TYPE_RE =
  /^(BIGINT\s+UNSIGNED|BIGINT|INT\s+UNSIGNED|INT|TINYINT\s+UNSIGNED|TINYINT|VARCHAR\(\d+\)|CHAR\(\d+\)|MEDIUMTEXT|LONGTEXT|TEXT|DATETIME|DATE|BOOLEAN|DECIMAL\(\d+,\d+\)|JSON|ENUM\([^)]*\))/i;

function typeToSequelize(rawType) {
  const t = rawType.trim();
  const up = t.toUpperCase();

  if (/^BIGINT\s+UNSIGNED/.test(up)) return 'DataTypes.BIGINT.UNSIGNED';
  if (/^BIGINT/.test(up)) return 'DataTypes.BIGINT';
  if (/^INT\s+UNSIGNED/.test(up)) return 'DataTypes.INTEGER.UNSIGNED';
  if (/^INT/.test(up)) return 'DataTypes.INTEGER';
  if (/^TINYINT\s+UNSIGNED/.test(up)) return 'DataTypes.TINYINT.UNSIGNED';
  if (/^TINYINT/.test(up)) return 'DataTypes.TINYINT';

  let m;
  if ((m = t.match(/^VARCHAR\((\d+)\)/i))) return `DataTypes.STRING(${m[1]})`;
  if ((m = t.match(/^CHAR\((\d+)\)/i))) return `DataTypes.CHAR(${m[1]})`;
  if (up === 'MEDIUMTEXT') return "DataTypes.TEXT('medium')";
  if (up === 'LONGTEXT') return "DataTypes.TEXT('long')";
  if (up === 'TEXT') return 'DataTypes.TEXT';
  if (up === 'DATETIME') return 'DataTypes.DATE';
  if (up === 'DATE') return 'DataTypes.DATEONLY';
  if (up === 'BOOLEAN' || up === 'BOOL') return 'DataTypes.BOOLEAN';
  if ((m = t.match(/^DECIMAL\((\d+),(\d+)\)/i))) return `DataTypes.DECIMAL(${m[1]}, ${m[2]})`;
  if (up === 'JSON') return 'DataTypes.JSON';
  if (/^ENUM\(/i.test(t)) {
    const values = [...t.matchAll(/'([^']*)'/g)].map((mm) => `'${mm[1]}'`);
    return `DataTypes.ENUM(${values.join(', ')})`;
  }
  throw new Error(`Tipo MySQL no soportado por el generador: "${rawType}"`);
}

function parseDefault(modifiers) {
  const m = modifiers.match(/DEFAULT\s+('(?:[^']*)'|TRUE|FALSE|CURRENT_TIMESTAMP|-?\d+(?:\.\d+)?)/i);
  if (!m) return undefined;
  const raw = m[1];
if (/^CURRENT_TIMESTAMP$/i.test(raw)) return 'DataTypes.NOW';
  if (/^TRUE$/i.test(raw)) return 'true';
  if (/^FALSE$/i.test(raw)) return 'false';
  if (/^'.*'$/.test(raw)) return raw;
  return raw; // numero
}

function parseCreateTable(tableName, body) {
  const chunks = splitTopLevel(body);
  const columns = []; // { name, order }
  const compositePK = [];
  const foreignKeys = []; // { column, refTable, onDelete }

  chunks.forEach((chunk) => {
    if (/^CONSTRAINT/i.test(chunk)) {
      const fk = chunk.match(
        /FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)\s*\([^)]*\)(?:\s+ON DELETE\s+(CASCADE|RESTRICT|SET NULL|NO ACTION|SET DEFAULT))?/i
      );
      if (fk) {
        foreignKeys.push({ column: fk[1], refTable: fk[2], onDelete: fk[3] || null });
      }
      // Los CHECK constraints los aplica MySQL; el ORM no los necesita replicar.
      return;
    }
    if (/^PRIMARY KEY\s*\(/i.test(chunk)) {
      const cols = chunk.match(/\(([^)]+)\)/)[1].split(',').map((c) => c.trim());
      compositePK.push(...cols);
      return;
    }
    if (/^UNIQUE\s+KEY/i.test(chunk) || /^UNIQUE\s*\(/i.test(chunk)) {
      return; // indice compuesto: MySQL lo sigue exigiendo aunque el ORM no lo declare
    }

    // Definicion de columna: "nombre TIPO modificadores..."
    const colMatch = chunk.match(/^(\w+)\s+(.+)$/s);
    if (!colMatch) return;
    const [, name, rest] = colMatch;
    const typeMatch = rest.match(TYPE_RE);
    if (!typeMatch) {
      throw new Error(`No se pudo identificar el tipo en "${tableName}.${name}": "${rest}"`);
    }
    const rawType = typeMatch[1];
    const modifiers = rest.slice(typeMatch.index + rawType.length).trim();

    const allowNull = !/NOT\s+NULL/i.test(modifiers);
    const autoIncrement = /AUTO_INCREMENT/i.test(modifiers);
    const primaryKeyInline = /PRIMARY\s+KEY/i.test(modifiers);
    const uniqueInline = /\bUNIQUE\b/i.test(modifiers);
    const defaultExpr = parseDefault(modifiers);

    columns.push({
      name,
      sequelizeType: typeToSequelize(rawType),
      allowNull,
      autoIncrement,
      primaryKeyInline,
      uniqueInline,
      defaultExpr,
    });
  });

  return { tableName, columns, compositePK, foreignKeys };
}

function toPascalCase(snake) {
  return snake
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

function renderModelFile(table) {
  const modelName = toPascalCase(table.tableName);
  const lines = [];
  lines.push("'use strict';");
  lines.push('// Archivo generado automaticamente por scripts/generate-models.js');
  lines.push(`// a partir de database/vigia_schema.sql (tabla "${table.tableName}").`);
  lines.push('// No editar a mano: si el esquema SQL cambia, correr "npm run generate:models".');
  lines.push('');
  lines.push('module.exports = (sequelize, DataTypes) => {');
  lines.push(`  const ${modelName} = sequelize.define('${modelName}', {`);

  table.columns.forEach((col) => {
    const isCompositePK = table.compositePK.includes(col.name);
    const primaryKey = col.primaryKeyInline || isCompositePK;
    // Toda primary key es NOT NULL, la marquemos o no explicitamente en el SQL.
    const allowNull = primaryKey ? false : col.allowNull;
    const attrParts = [`type: ${col.sequelizeType}`, `allowNull: ${allowNull}`];
    if (primaryKey) attrParts.push('primaryKey: true');
    if (col.autoIncrement) attrParts.push('autoIncrement: true');
    if (col.uniqueInline && !primaryKey) attrParts.push('unique: true');
    if (col.defaultExpr !== undefined) attrParts.push(`defaultValue: ${col.defaultExpr}`);
    lines.push(`    ${col.name}: { ${attrParts.join(', ')} },`);
  });

  lines.push('  }, {');
  lines.push(`    tableName: '${table.tableName}',`);
  lines.push('    freezeTableName: true,');
  lines.push('    timestamps: false,');
  lines.push('  });');
  lines.push(`  return ${modelName};`);
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const sql = fs.readFileSync(SQL_PATH, 'utf8').replace(/--.*/g, '');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const tables = [];
  const allAssociations = [];

  statements.forEach((stmt) => {
    const m = stmt.match(/^CREATE TABLE\s+(\w+)\s*\(([\s\S]*)\)\s*ENGINE\s*=\s*InnoDB/i);
    if (!m) return;
    const [, tableName, body] = m;
    const parsed = parseCreateTable(tableName, body);
    tables.push(parsed);
    parsed.foreignKeys.forEach((fk) => {
      allAssociations.push({
        table: tableName,
        column: fk.column,
        refTable: fk.refTable,
        onDelete: fk.onDelete,
      });
    });
  });

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Limpia modelos generados previamente (no toca index.js, que es manual).
  // Si una tabla se elimino del SQL, su archivo viejo puede quedar huerfano
  // en sistemas de archivos que no permiten borrar (best-effort, no falla
  // la generacion si el borrado no esta permitido).
  fs.readdirSync(OUT_DIR)
    .filter((f) => f.endsWith('.js') && f !== 'index.js')
    .forEach((f) => {
      try {
        fs.unlinkSync(path.join(OUT_DIR, f));
      } catch (err) {
        // no-op: el archivo se sobreescribe de todos modos si su tabla sigue existiendo
      }
    });

  tables.forEach((table) => {
    const fileName = `${toPascalCase(table.tableName)}.js`;
    fs.writeFileSync(path.join(OUT_DIR, fileName), renderModelFile(table), 'utf8');
  });

  fs.writeFileSync(ASSOC_PATH, JSON.stringify(allAssociations, null, 2), 'utf8');

  console.log(`Generados ${tables.length} modelos en ${path.relative(process.cwd(), OUT_DIR)}`);
  console.log(`Asociaciones detectadas: ${allAssociations.length} (guardadas en _associations.json)`);
}

main();
